// The adopt flow (requirement b).
//
// validateAdoption() is pure: it turns untrusted form input into a clean
// request or field errors. createAdoption() does the write: inside a
// transaction it loads the bench's live adoptions, rejects any overlap with a
// specific message, upserts the donor by email, and inserts the adoption.
//
// Overlap is enforced twice (DECISIONS #10): findConflict() here gives the
// friendly error; the Postgres exclusion constraint "Adoption_no_overlap" is
// the guarantee when two requests race past the check at the same moment.

import type { PrismaClient } from "@/generated/prisma/client";
import { findConflict } from "./availability";
import { addMonths, displayDay, lastCoveredDay } from "./dates";

/** Durations offered in the form, in months (DECISIONS #4). */
export const DURATION_OPTIONS = [
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
  { months: 60, label: "5 years" },
] as const;

/** The server accepts any whole number of months in this range (SPEC §5). */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 120;

export const NAME_MAX = 80;
export const DEDICATION_MAX = 140;

export interface AdoptionRequest {
  displayName: string;
  email: string;
  dedication: string | null;
  months: number;
}

export type AdoptionField = keyof AdoptionRequest;

export type ValidationResult =
  | { ok: true; value: AdoptionRequest }
  | { ok: false; errors: Partial<Record<AdoptionField, string>> };

function clean(v: unknown): string {
  return typeof v === "string"
    ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A light guard, not moderation (SPEC §11): plaques shouldn't carry links.
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|xyz|info|biz)\b)/i;

export function validateAdoption(input: {
  displayName?: unknown;
  email?: unknown;
  dedication?: unknown;
  months?: unknown;
}): ValidationResult {
  const errors: Partial<Record<AdoptionField, string>> = {};

  const displayName = clean(input.displayName);
  if (displayName.length < 2) errors.displayName = "Please enter the name to display.";
  else if (displayName.length > NAME_MAX)
    errors.displayName = `Keep the name to ${NAME_MAX} characters or fewer.`;

  const email = clean(input.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254)
    errors.email = "Please enter a valid email address.";

  const dedicationText = clean(input.dedication);
  if (dedicationText.length > DEDICATION_MAX)
    errors.dedication = `Dedications are limited to ${DEDICATION_MAX} characters (plaque size).`;
  else if (URL_RE.test(dedicationText))
    errors.dedication = "Dedications can't include web addresses.";

  const months = Number(clean(input.months));
  if (!Number.isInteger(months) || months < MIN_MONTHS || months > MAX_MONTHS)
    errors.months = "Please choose an adoption length.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { displayName, email, dedication: dedicationText || null, months },
  };
}

export type AdoptResult =
  | { ok: true; startDate: Date; endDate: Date }
  | { ok: false; reason: "NOT_FOUND" | "CONFLICT"; message: string };

/** Postgres exclusion-constraint violation from our no-overlap constraint. */
function isOverlapViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let e: unknown = err;
  // Prisma wraps driver errors; walk the cause chain looking for 23P01.
  while (e && typeof e === "object" && !seen.has(e)) {
    seen.add(e);
    const o = e as Record<string, unknown>;
    if (
      o.code === "23P01" ||
      o.originalCode === "23P01" ||
      String(o.message ?? "").includes("Adoption_no_overlap")
    ) {
      return true;
    }
    e = o.cause;
  }
  return false;
}

/**
 * Adopt `benchCode` starting `startDate` (today, in the MVP) for
 * `request.months`. Never trusts client-supplied dates.
 */
export async function createAdoption(
  db: PrismaClient,
  benchCode: string,
  request: AdoptionRequest,
  startDate: Date,
): Promise<AdoptResult> {
  const endDate = addMonths(startDate, request.months);

  try {
    return await db.$transaction(async (tx) => {
      const bench = await tx.bench.findFirst({
        where: { code: benchCode, active: true },
        select: {
          id: true,
          code: true,
          adoptions: {
            // Only live adoptions that could possibly overlap [start, end).
            where: { cancelledAt: null, endDate: { gt: startDate }, startDate: { lt: endDate } },
            select: { startDate: true, endDate: true, cancelledAt: true },
          },
        },
      });
      if (!bench) {
        return { ok: false, reason: "NOT_FOUND", message: "That bench doesn't exist." } as const;
      }

      const conflict = findConflict(bench.adoptions, { startDate, endDate });
      if (conflict) {
        return { ok: false, reason: "CONFLICT", message: conflictMessage(bench.code, conflict, startDate, endDate) } as const;
      }

      const donor = await tx.donor.upsert({
        where: { email: request.email },
        create: { email: request.email, displayName: request.displayName },
        update: { displayName: request.displayName },
        select: { id: true },
      });

      await tx.adoption.create({
        data: {
          benchId: bench.id,
          donorId: donor.id,
          startDate,
          endDate,
          dedication: request.dedication,
        },
      });

      return { ok: true, startDate, endDate } as const;
    });
  } catch (err) {
    if (isOverlapViolation(err)) {
      // Lost a race: someone else's adoption committed between our check and insert.
      return {
        ok: false,
        reason: "CONFLICT",
        message: `Bench ${benchCode} was just adopted by someone else. Please choose another bench.`,
      };
    }
    throw err;
  }
}

function conflictMessage(
  code: string,
  conflict: { startDate: Date; endDate: Date },
  startDate: Date,
  endDate: Date,
): string {
  const through = displayDay(lastCoveredDay(conflict.endDate));
  if (conflict.startDate.getTime() <= startDate.getTime()) {
    return (
      `Bench ${code} is already adopted through ${through}. ` +
      `It becomes available on ${displayDay(conflict.endDate)}.`
    );
  }
  return (
    `Bench ${code} is reserved starting ${displayDay(conflict.startDate)}, so an adoption ` +
    `running through ${displayDay(lastCoveredDay(endDate))} would overlap it.`
  );
}
