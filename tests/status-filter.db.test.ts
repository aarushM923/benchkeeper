// The list page filters by status in SQL (statusWhere) but displays status via
// getBenchStatus(). These must never disagree. This test builds a database of
// randomized and hand-picked edge-case adoption histories, then checks that
// every SQL filter returns exactly the benches the pure function would.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPIRING_SOON_DAYS, getBenchStatus } from "@/lib/availability";
import { STATUS_FILTERS, statusWhere, type StatusFilter } from "@/lib/benches";
import { addDays, parseDay } from "@/lib/dates";
import { TEST_DATABASE_URL, testDb, wipe } from "./db-helpers";

const asOf = parseDay("2026-09-21");

// Edge cases, as offsets in days from asOf: [start, end) pairs.
const EDGE_CASES: Record<string, [number, number][]> = {
  endsToday: [[-365, 0]], // end is exclusive → free today
  startsToday: [[0, 365]],
  startsTomorrow: [[1, 366]],
  expiringExactly: [[-300, EXPIRING_SOON_DAYS]],
  expiringOneDayLate: [[-300, EXPIRING_SOON_DAYS + 1]],
  backToBack: [[-400, 30], [30, 400]],
  expiredThenReserved: [[-800, -100], [50, 400]],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Non-overlapping [start, end) day-offset pairs laid end to end with gaps. */
function randomHistory(rand: () => number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = -1200 + Math.floor(rand() * 400);
  const n = Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const start = cursor + Math.floor(rand() * 300); // gap may be 0 → adjacent
    const end = start + 1 + Math.floor(rand() * 900);
    out.push([start, end]);
    cursor = end;
  }
  return out;
}

describe.skipIf(!TEST_DATABASE_URL)("statusWhere agrees with getBenchStatus", () => {
  const db = TEST_DATABASE_URL ? testDb() : null!;

  beforeAll(async () => {
    await wipe(db);
    const donor = await db.donor.create({
      data: { displayName: "Test Donor", email: "test@example.com" },
    });

    const histories: [string, [number, number][]][] = Object.entries(EDGE_CASES);
    const rand = mulberry32(7);
    for (let i = 0; i < 250; i++) histories.push([`R-${i}`, randomHistory(rand)]);

    for (const [code, ranges] of histories) {
      const bench = await db.bench.create({ data: { code, zone: "Test" } });
      await db.adoption.createMany({
        data: ranges.map(([s, e]) => ({
          benchId: bench.id,
          donorId: donor.id,
          startDate: addDays(asOf, s),
          endDate: addDays(asOf, e),
        })),
      });
      // A cancelled adoption covering today must be ignored by both sides.
      // (The exclusion constraint allows it because it's cancelled.)
      if (code.endsWith("3")) {
        await db.adoption.create({
          data: {
            benchId: bench.id,
            donorId: donor.id,
            startDate: addDays(asOf, -10),
            endDate: addDays(asOf, 10),
            cancelledAt: new Date(),
          },
        });
      }
    }
  }, 60_000);

  afterAll(async () => {
    await wipe(db);
    await db.$disconnect();
  });

  function expected(
    benches: { code: string; adoptions: Parameters<typeof getBenchStatus>[0] }[],
    filter: StatusFilter,
  ) {
    return benches
      .filter((b) => {
        const s = getBenchStatus(b.adoptions, asOf);
        return filter === "EXPIRING_SOON"
          ? s.kind === "ADOPTED" && s.expiringSoon
          : s.kind === filter;
      })
      .map((b) => b.code)
      .sort();
  }

  it.each(STATUS_FILTERS)("%s", async (filter) => {
    const all = await db.bench.findMany({ include: { adoptions: true } });
    const fromSql = await db.bench.findMany({
      where: statusWhere(filter, asOf),
      select: { code: true },
    });
    expect(fromSql.map((b) => b.code).sort()).toEqual(expected(all, filter));
  });

  it("every bench lands in exactly one of AVAILABLE / ADOPTED / RESERVED", async () => {
    const total = await db.bench.count();
    const counts = await Promise.all(
      (["AVAILABLE", "ADOPTED", "RESERVED"] as const).map((f) =>
        db.bench.count({ where: statusWhere(f, asOf) }),
      ),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("edge cases classify as intended", async () => {
    const byCode = async (code: string) => {
      const b = await db.bench.findUniqueOrThrow({
        where: { code },
        include: { adoptions: true },
      });
      return getBenchStatus(b.adoptions, asOf);
    };
    expect((await byCode("endsToday")).kind).toBe("AVAILABLE");
    expect((await byCode("startsToday")).kind).toBe("ADOPTED");
    expect((await byCode("startsTomorrow")).kind).toBe("RESERVED");
    expect((await byCode("backToBack")).kind).toBe("ADOPTED");
    expect((await byCode("expiredThenReserved")).kind).toBe("RESERVED");
  });
});
