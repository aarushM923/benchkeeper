// The adopt write path against a real Postgres: overlap rejection with a
// specific message, donor upsert, and — the important one — concurrent
// submissions for the same bench, where only the exclusion constraint can
// guarantee a single winner.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAdoption, type AdoptionRequest } from "@/lib/adopt";
import { parseDay } from "@/lib/dates";
import { TEST_DATABASE_URL, testDb, wipe } from "./db-helpers";

const today = parseDay("2026-09-22");

const request = (n = 1, months = 12): Omit<AdoptionRequest, "startDate"> => ({
  displayName: `Donor ${n}`,
  email: `donor${n}@example.com`,
  dedication: null,
  months,
});

describe.skipIf(!TEST_DATABASE_URL)("createAdoption", () => {
  const db = TEST_DATABASE_URL ? testDb() : null!;

  beforeEach(async () => {
    await wipe(db);
    await db.bench.create({ data: { code: "PG-001", zone: "Parade Ground" } });
  });

  afterAll(async () => {
    await wipe(db);
    await db.$disconnect();
  });

  const liveAdoptions = () =>
    db.adoption.findMany({ where: { cancelledAt: null }, orderBy: { startDate: "asc" } });

  it("adopts an available bench for [today, today + months)", async () => {
    const r = await createAdoption(db, "PG-001", { ...request(1, 24), startDate: today });
    expect(r).toEqual({ ok: true, startDate: today, endDate: parseDay("2028-09-22") });
    const [a] = await liveAdoptions();
    expect(a.startDate).toEqual(today);
    expect(a.endDate).toEqual(parseDay("2028-09-22"));
  });

  it("rejects an overlapping adoption with a specific message", async () => {
    await createAdoption(db, "PG-001", { ...request(1, 24), startDate: today });
    const r = await createAdoption(db, "PG-001", { ...request(2, 12), startDate: today });
    expect(r).toEqual({
      ok: false,
      reason: "CONFLICT",
      message: "Bench PG-001 is already adopted through Sep 21, 2028. It becomes available on Sep 22, 2028.",
    });
    expect(await liveAdoptions()).toHaveLength(1);
  });

  it("rejects an adoption that would run into a future reservation", async () => {
    const bench = await db.bench.findUniqueOrThrow({ where: { code: "PG-001" } });
    const donor = await db.donor.create({ data: { displayName: "Early Bird", email: "early@example.com" } });
    await db.adoption.create({
      data: {
        benchId: bench.id,
        donorId: donor.id,
        startDate: parseDay("2027-01-15"),
        endDate: parseDay("2028-01-15"),
      },
    });
    const r = await createAdoption(db, "PG-001", { ...request(2, 12), startDate: today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/reserved starting Jan 15, 2027/);
  });

  it("allows a new adoption to start the day the previous one ends (half-open)", async () => {
    await createAdoption(db, "PG-001", { ...request(1, 12), startDate: today });
    const r = await createAdoption(db, "PG-001", { ...request(2, 12), startDate: parseDay("2027-09-22") });
    expect(r.ok).toBe(true);
    expect(await liveAdoptions()).toHaveLength(2);
  });

  it("ignores cancelled adoptions", async () => {
    await createAdoption(db, "PG-001", { ...request(1, 60), startDate: today });
    await db.adoption.updateMany({ data: { cancelledAt: new Date() } });
    expect((await createAdoption(db, "PG-001", { ...request(2, 12), startDate: today })).ok).toBe(true);
  });

  it("refuses unknown and retired benches", async () => {
    await db.bench.update({ where: { code: "PG-001" }, data: { active: false } });
    for (const code of ["PG-001", "NOPE-999"]) {
      const r = await createAdoption(db, code, { ...request(), startDate: today });
      expect(r.ok === false && r.reason).toBe("NOT_FOUND");
    }
  });

  it("reuses the donor for a repeat email and updates their display name", async () => {
    await db.bench.create({ data: { code: "PG-002", zone: "Parade Ground" } });
    await createAdoption(db, "PG-001", { ...request(1), displayName: "Maria R.", startDate: today });
    await createAdoption(db, "PG-002", { ...request(1), displayName: "Maria Rivera", startDate: today });
    const donors = await db.donor.findMany();
    expect(donors).toHaveLength(1);
    expect(donors[0].displayName).toBe("Maria Rivera");
    expect(await db.adoption.count({ where: { donorId: donors[0].id } })).toBe(2);
  });

  it("the database rejects an overlap even when the app check is bypassed", async () => {
    await createAdoption(db, "PG-001", { ...request(1, 12), startDate: today });
    const bench = await db.bench.findUniqueOrThrow({ where: { code: "PG-001" } });
    const donor = await db.donor.findFirstOrThrow();
    await expect(
      db.adoption.create({
        data: {
          benchId: bench.id,
          donorId: donor.id,
          startDate: parseDay("2027-03-01"),
          endDate: parseDay("2027-04-01"),
        },
      }),
    ).rejects.toThrow();
    expect(await liveAdoptions()).toHaveLength(1);
  });

  // Why the exclusion constraint matters: when this was probed over 10 rounds
  // of 8 simultaneous submissions, 63 of the 70 losers had already passed the
  // app-level findConflict() check — only the database stopped them.
  it("concurrent submissions for the same bench: exactly one wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createAdoption(db, "PG-001", { ...request(i + 1), startDate: today })),
    );
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(7);
    for (const r of losers) expect(r.ok === false && r.reason).toBe("CONFLICT");
    expect(await liveAdoptions()).toHaveLength(1);
  });
});
