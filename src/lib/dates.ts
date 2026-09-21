// Calendar-day helpers.
//
// Every "day" in this app is a Date at UTC midnight, matching how Postgres
// DATE columns round-trip through Prisma. We never use local-time Date methods
// (getDate, setMonth, ...) on these values: on a machine in New York they'd
// shift a DATE by one day compared with a server running in UTC.

export const PARK_TIME_ZONE = "America/New_York";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. Throws on malformed input. */
export function parseDay(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid day: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || formatDay(d) !== iso) {
    throw new Error(`Invalid day: ${iso}`);
  }
  return d;
}

/** Format a UTC-midnight Date as "YYYY-MM-DD". */
export function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the park's time zone, as a UTC-midnight Date. */
export function today(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDay(iso);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Add calendar months, clamping to the end of shorter months:
 * Jan 31 + 1 month = Feb 28 (or 29), Feb 29 + 12 months = Feb 28.
 */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTarget);
  return new Date(Date.UTC(y, m, day));
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Human-friendly day, e.g. "Jun 1, 2028". Always rendered in UTC. */
export function displayDay(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Ranges are half-open [start, end): `end` is the first free day. For copy
 * that says "through", show the last *covered* day instead.
 */
export function lastCoveredDay(end: Date): Date {
  return addDays(end, -1);
}
