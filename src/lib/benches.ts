// Public bench queries.
//
// Status filtering and pagination happen in the database, so the list never
// loads all 500+ benches to show 25. That means the status rules are expressed
// twice: once in getBenchStatus() (availability.ts) for display, and once here
// as Prisma where-clauses for filtering. tests/status-filter.db.test.ts checks
// that the two agree for every seeded bench.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { EXPIRING_SOON_DAYS } from "./availability";
import { addDays } from "./dates";
import { toPublicBench, type PublicBench } from "./public";

export const PAGE_SIZE = 25;

export const STATUS_FILTERS = ["AVAILABLE", "ADOPTED", "EXPIRING_SOON", "RESERVED"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function isStatusFilter(v: unknown): v is StatusFilter {
  return typeof v === "string" && (STATUS_FILTERS as readonly string[]).includes(v);
}

const live = { cancelledAt: null } satisfies Prisma.AdoptionWhereInput;

/** A live adoption whose [start, end) contains asOf. Mirrors coversDay(). */
function covering(asOf: Date): Prisma.AdoptionWhereInput {
  return { ...live, startDate: { lte: asOf }, endDate: { gt: asOf } };
}

/** SQL twin of getBenchStatus(): benches whose derived status matches `filter`. */
export function statusWhere(filter: StatusFilter, asOf: Date): Prisma.BenchWhereInput {
  switch (filter) {
    case "ADOPTED":
      return { adoptions: { some: covering(asOf) } };
    case "EXPIRING_SOON":
      return {
        adoptions: {
          some: {
            ...covering(asOf),
            endDate: { gt: asOf, lte: addDays(asOf, EXPIRING_SOON_DAYS) },
          },
        },
      };
    case "RESERVED":
      return {
        AND: [
          { adoptions: { none: covering(asOf) } },
          { adoptions: { some: { ...live, startDate: { gt: asOf } } } },
        ],
      };
    case "AVAILABLE":
      // Nothing current and nothing upcoming: every live adoption has ended.
      return { adoptions: { none: { ...live, endDate: { gt: asOf } } } };
  }
}

/**
 * The only select used for public bench reads. Donor is narrowed to
 * displayName at the query, so email is never even loaded (DECISIONS #6).
 * Only adoptions that haven't ended yet are needed to derive status.
 */
function publicBenchSelect(asOf: Date) {
  return {
    code: true,
    zone: true,
    material: true,
    installedYear: true,
    lat: true,
    lng: true,
    adoptions: {
      where: { ...live, endDate: { gt: asOf } },
      orderBy: { startDate: "asc" },
      select: {
        startDate: true,
        endDate: true,
        cancelledAt: true,
        dedication: true,
        donor: { select: { displayName: true } },
      },
    },
  } satisfies Prisma.BenchSelect;
}

export interface BenchListQuery {
  q?: string;
  zone?: string;
  status?: StatusFilter;
  page?: number;
}

export interface BenchListResult {
  benches: PublicBench[];
  total: number;
  page: number;
  pageCount: number;
}

export function benchListWhere(query: BenchListQuery, asOf: Date): Prisma.BenchWhereInput {
  const and: Prisma.BenchWhereInput[] = [{ active: true }];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { zone: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (query.zone) and.push({ zone: query.zone });
  if (query.status) and.push(statusWhere(query.status, asOf));
  return { AND: and };
}

export async function listBenches(
  db: PrismaClient,
  query: BenchListQuery,
  asOf: Date,
): Promise<BenchListResult> {
  const where = benchListWhere(query, asOf);
  const total = await db.bench.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), pageCount);

  const rows = await db.bench.findMany({
    where,
    select: publicBenchSelect(asOf),
    orderBy: { code: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    benches: rows.map((b) => toPublicBench(b, asOf)),
    total,
    page,
    pageCount,
  };
}

export async function getPublicBench(
  db: PrismaClient,
  code: string,
  asOf: Date,
): Promise<PublicBench | null> {
  const row = await db.bench.findFirst({
    where: { code, active: true },
    select: publicBenchSelect(asOf),
  });
  return row ? toPublicBench(row, asOf) : null;
}

export async function listZones(db: PrismaClient): Promise<string[]> {
  const rows = await db.bench.findMany({
    where: { active: true },
    distinct: ["zone"],
    select: { zone: true },
    orderBy: { zone: "asc" },
  });
  return rows.map((r) => r.zone);
}
