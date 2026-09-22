// Admin data access: the operational "source of truth" views (SPEC §2).
// Unlike the public queries, these DO load donor email. Every caller must have
// passed requireAdmin() first.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { checkDedication, clean, conflictMessage, isOverlapViolation } from "./adopt";
import { adoptionPhase, findConflict, type AdoptionPhase } from "./availability";
import { parseDay } from "./dates";

export const ADMIN_PAGE_SIZE = 50;
export const PHASES = ["CURRENT", "UPCOMING", "ENDED", "CANCELLED"] as const satisfies readonly AdoptionPhase[];

export function isPhase(v: unknown): v is AdoptionPhase {
  return typeof v === "string" && (PHASES as readonly string[]).includes(v);
}

/** SQL twin of adoptionPhase(). */
export function phaseWhere(phase: AdoptionPhase, asOf: Date): Prisma.AdoptionWhereInput {
  switch (phase) {
    case "CANCELLED":
      return { cancelledAt: { not: null } };
    case "CURRENT":
      return { cancelledAt: null, startDate: { lte: asOf }, endDate: { gt: asOf } };
    case "UPCOMING":
      return { cancelledAt: null, startDate: { gt: asOf } };
    case "ENDED":
      return { cancelledAt: null, endDate: { lte: asOf } };
  }
}

export interface AdoptionQuery {
  q?: string;
  phase?: AdoptionPhase;
  donorId?: string;
  benchCode?: string;
}

export function adoptionWhere(query: AdoptionQuery, asOf: Date): Prisma.AdoptionWhereInput {
  const and: Prisma.AdoptionWhereInput[] = [];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { bench: { code: { contains: q, mode: "insensitive" } } },
        { donor: { displayName: { contains: q, mode: "insensitive" } } },
        { donor: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (query.phase) and.push(phaseWhere(query.phase, asOf));
  if (query.donorId) and.push({ donorId: query.donorId });
  if (query.benchCode) and.push({ bench: { code: query.benchCode } });
  return { AND: and };
}

const adminAdoptionSelect = {
  id: true,
  startDate: true,
  endDate: true,
  dedication: true,
  createdAt: true,
  cancelledAt: true,
  bench: { select: { code: true, zone: true, active: true } },
  donor: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.AdoptionSelect;

export type AdminAdoption = Prisma.AdoptionGetPayload<{ select: typeof adminAdoptionSelect }> & {
  phase: AdoptionPhase;
};

export async function listAdoptions(
  db: PrismaClient,
  query: AdoptionQuery,
  asOf: Date,
  page: number | "all" = 1,
): Promise<{ adoptions: AdminAdoption[]; total: number; page: number; pageCount: number }> {
  const where = adoptionWhere(query, asOf);
  const total = await db.adoption.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const p = page === "all" ? 1 : Math.min(Math.max(1, page), pageCount);
  const rows = await db.adoption.findMany({
    where,
    select: adminAdoptionSelect,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    ...(page === "all" ? {} : { skip: (p - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE }),
  });
  return {
    adoptions: rows.map((a) => ({ ...a, phase: adoptionPhase(a, asOf) })),
    total,
    page: p,
    pageCount,
  };
}

export async function getAdoption(db: PrismaClient, id: string, asOf: Date) {
  const a = await db.adoption.findUnique({ where: { id }, select: adminAdoptionSelect });
  return a ? { ...a, phase: adoptionPhase(a, asOf) } : null;
}

export type AdminResult = { ok: true } | { ok: false; message: string };

/**
 * Edit an adoption's end date and/or dedication. Moving the end date re-runs
 * the same overlap rules as adopting (app check + exclusion constraint).
 */
export async function updateAdoption(
  db: PrismaClient,
  id: string,
  input: { endDate: string; dedication: string },
): Promise<AdminResult> {
  let endDate: Date;
  try {
    endDate = parseDay(input.endDate);
  } catch {
    return { ok: false, message: "End date must be a valid date." };
  }
  const dedication = clean(input.dedication);
  const dedicationError = checkDedication(dedication);
  if (dedicationError) return { ok: false, message: dedicationError };

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.adoption.findUnique({
        where: { id },
        select: { startDate: true, cancelledAt: true, benchId: true, bench: { select: { code: true } } },
      });
      if (!current) return { ok: false, message: "Adoption not found." } as const;
      if (current.cancelledAt) return { ok: false, message: "Cancelled adoptions can't be edited." } as const;
      if (endDate.getTime() <= current.startDate.getTime()) {
        return { ok: false, message: "The end date must be after the start date." } as const;
      }

      const others = await tx.adoption.findMany({
        where: { benchId: current.benchId, cancelledAt: null, id: { not: id } },
        select: { startDate: true, endDate: true, cancelledAt: true },
      });
      const conflict = findConflict(others, { startDate: current.startDate, endDate });
      if (conflict) {
        return {
          ok: false,
          message: conflictMessage(current.bench.code, conflict, current.startDate, endDate),
        } as const;
      }

      await tx.adoption.update({
        where: { id },
        data: { endDate, dedication: dedication || null },
      });
      return { ok: true } as const;
    });
  } catch (err) {
    if (isOverlapViolation(err)) {
      return { ok: false, message: "That change would overlap another adoption of this bench." };
    }
    throw err;
  }
}

/** Soft-cancel: the row stays for history; status derivation ignores it. */
export async function cancelAdoption(db: PrismaClient, id: string): Promise<AdminResult> {
  const { count } = await db.adoption.updateMany({
    where: { id, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  return count === 1 ? { ok: true } : { ok: false, message: "Adoption not found or already cancelled." };
}

// ------------------------------------------------------------------ CSV

const CSV_HEADER = [
  "bench_code",
  "zone",
  "donor_name",
  "donor_email",
  "start_date",
  "last_day",
  "end_date_exclusive",
  "status",
  "dedication",
  "created_at",
  "cancelled_at",
];

/**
 * RFC 4180 quoting, plus a guard against CSV/formula injection: dedications and
 * names are visitor-supplied, and a cell starting with = + - @ would run as a
 * formula when staff open the export in Excel or Sheets.
 */
export function csvCell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function adoptionsToCsv(rows: AdminAdoption[]): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const lines = rows.map((a) =>
    [
      a.bench.code,
      a.bench.zone,
      a.donor.displayName,
      a.donor.email,
      day(a.startDate),
      day(new Date(a.endDate.getTime() - 86_400_000)),
      day(a.endDate),
      a.phase,
      a.dedication,
      a.createdAt.toISOString(),
      a.cancelledAt?.toISOString() ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ benches

export interface BenchInput {
  code?: string;
  zone: string;
  material: string;
  installedYear: string;
  notes: string;
}

const CODE_RE = /^[A-Z]{1,4}-\d{1,4}$/;

function parseBenchInput(input: BenchInput) {
  const zone = clean(input.zone);
  const material = clean(input.material) || null;
  const notes = clean(input.notes).slice(0, 500) || null;
  const yearText = clean(input.installedYear);
  const installedYear = yearText ? Number(yearText) : null;
  if (zone.length < 2) return { error: "Zone is required." } as const;
  if (installedYear !== null && (!Number.isInteger(installedYear) || installedYear < 1850 || installedYear > 2100)) {
    return { error: "Installed year must be a year between 1850 and 2100." } as const;
  }
  return { data: { zone, material, notes, installedYear } } as const;
}

export async function createBench(db: PrismaClient, input: BenchInput): Promise<AdminResult & { code?: string }> {
  const code = clean(input.code).toUpperCase();
  if (!CODE_RE.test(code)) return { ok: false, message: "Code must look like PG-014." };
  const parsed = parseBenchInput(input);
  if ("error" in parsed) return { ok: false, message: parsed.error! };
  const exists = await db.bench.findUnique({ where: { code }, select: { id: true } });
  if (exists) return { ok: false, message: `Bench ${code} already exists.` };
  await db.bench.create({ data: { code, ...parsed.data } });
  return { ok: true, code };
}

export async function updateBench(db: PrismaClient, code: string, input: BenchInput): Promise<AdminResult> {
  const parsed = parseBenchInput(input);
  if ("error" in parsed) return { ok: false, message: parsed.error! };
  const { count } = await db.bench.updateMany({ where: { code }, data: parsed.data });
  return count === 1 ? { ok: true } : { ok: false, message: "Bench not found." };
}

/**
 * Retire (soft-delete) or restore a bench. Retiring is refused while the bench
 * has a current or upcoming adoption — a donor would silently lose their bench.
 */
export async function setBenchActive(
  db: PrismaClient,
  code: string,
  active: boolean,
  asOf: Date,
): Promise<AdminResult> {
  const bench = await db.bench.findUnique({
    where: { code },
    select: {
      id: true,
      _count: { select: { adoptions: { where: { cancelledAt: null, endDate: { gt: asOf } } } } },
    },
  });
  if (!bench) return { ok: false, message: "Bench not found." };
  if (!active && bench._count.adoptions > 0) {
    return {
      ok: false,
      message: `Bench ${code} has ${bench._count.adoptions} current or upcoming adoption(s). Cancel them before retiring it.`,
    };
  }
  await db.bench.update({ where: { id: bench.id }, data: { active } });
  return { ok: true };
}
