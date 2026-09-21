// The core of the app: availability is a function of time.
//
// A bench never stores whether it's adopted. Instead it has adoptions, each a
// half-open date range [startDate, endDate), and its status is derived from
// those ranges relative to an "as of" day. This file is deliberately pure — no
// database, no framework — so it can be unit-tested exhaustively and reused by
// pages, API routes, and the adopt flow alike.

import { daysBetween } from "./dates";

export interface DateRange {
  startDate: Date;
  endDate: Date; // exclusive: the first day the bench is free again
}

export interface AdoptionLike extends DateRange {
  cancelledAt?: Date | null;
}

/** An adopted bench counts as "expiring soon" when it frees up within this many days. */
export const EXPIRING_SOON_DAYS = 60;

export type BenchStatus<A extends AdoptionLike = AdoptionLike> =
  | { kind: "AVAILABLE" }
  | { kind: "ADOPTED"; adoption: A; expiringSoon: boolean }
  | { kind: "RESERVED"; adoption: A }; // free on asOf, but a future adoption is booked

export type StatusKind = BenchStatus["kind"];
export const STATUS_KINDS: readonly StatusKind[] = ["AVAILABLE", "ADOPTED", "RESERVED"];

/**
 * Half-open interval overlap: [aStart, aEnd) and [bStart, bEnd) share at least
 * one day. Touching ranges (aEnd === bStart) do NOT overlap, so an adoption
 * ending June 1 and a renewal starting June 1 can coexist.
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** True if `day` falls inside [start, end). */
export function coversDay(range: DateRange, day: Date): boolean {
  return (
    range.startDate.getTime() <= day.getTime() &&
    day.getTime() < range.endDate.getTime()
  );
}

function isLive(a: AdoptionLike): boolean {
  return a.cancelledAt == null;
}

/**
 * Derive a bench's status on `asOf` from its adoptions.
 *
 * - ADOPTED  if a live adoption covers asOf.
 * - RESERVED if none does, but a live adoption starts after asOf (the earliest one).
 * - AVAILABLE otherwise — including when every adoption has expired.
 *
 * Cancelled adoptions are ignored. Adoptions may be passed in any order.
 */
export function getBenchStatus<A extends AdoptionLike>(
  adoptions: readonly A[],
  asOf: Date,
): BenchStatus<A> {
  const live = adoptions.filter(isLive);

  const current = live.find((a) => coversDay(a, asOf));
  if (current) {
    const daysLeft = daysBetween(asOf, current.endDate);
    return {
      kind: "ADOPTED",
      adoption: current,
      expiringSoon: daysLeft <= EXPIRING_SOON_DAYS,
    };
  }

  const upcoming = live
    .filter((a) => a.startDate.getTime() > asOf.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (upcoming) return { kind: "RESERVED", adoption: upcoming };

  return { kind: "AVAILABLE" };
}

/** The first live adoption that overlaps `proposed`, or null if it's free. */
export function findConflict<A extends AdoptionLike>(
  existing: readonly A[],
  proposed: DateRange,
): A | null {
  return (
    existing
      .filter(isLive)
      .filter((a) =>
        rangesOverlap(a.startDate, a.endDate, proposed.startDate, proposed.endDate),
      )
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null
  );
}
