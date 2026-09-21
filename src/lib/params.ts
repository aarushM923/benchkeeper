// Parse untrusted query-string input into typed queries. Shared by pages and
// API routes so both accept exactly the same parameters.

import { isStatusFilter, type BenchListQuery } from "./benches";
import { parseDay, today } from "./dates";

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseListQuery(sp: RawParams): BenchListQuery {
  const q = first(sp.q)?.trim().slice(0, 100) || undefined;
  const zone = first(sp.zone)?.slice(0, 100) || undefined;
  const status = first(sp.status);
  const page = Number.parseInt(first(sp.page) ?? "1", 10);
  return {
    q,
    zone,
    status: isStatusFilter(status) ? status : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * The "as of" day for status derivation. Defaults to today (park time); an
 * optional ?asOf=YYYY-MM-DD lets anyone ask "what did/will this look like on X?".
 * Returns `custom: true` when the caller asked for a day other than today.
 */
export function parseAsOf(sp: RawParams): { asOf: Date; custom: boolean } {
  const now = today();
  const raw = first(sp.asOf);
  if (!raw) return { asOf: now, custom: false };
  try {
    const asOf = parseDay(raw);
    return { asOf, custom: asOf.getTime() !== now.getTime() };
  } catch {
    return { asOf: now, custom: false };
  }
}

/** Convert a URLSearchParams to the RawParams shape. */
export function fromSearchParams(usp: URLSearchParams): RawParams {
  return Object.fromEntries(usp.entries());
}
