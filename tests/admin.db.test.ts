// Admin write paths against a real Postgres: editing an adoption re-runs the
// overlap rules, cancelling frees the bench, retiring is refused while a bench
// has live adoptions, and the phase filter agrees with adoptionPhase().

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelAdoption,
  createBench,
  listAdoptions,
  PHASES,
  setBenchActive,
  updateAdoption,
} from "@/lib/admin";
import { createAdoption } from "@/lib/adopt";
import { adoptionPhase, getBenchStatus } from "@/lib/availability";
import { addDays, parseDay } from "@/lib/dates";
import { TEST_DATABASE_URL, testDb, wipe } from "./db-helpers";

const today = parseDay("2026-09-22");
const req = (n: number, months = 12) => ({
  displayName: `Donor ${n}`,
  email: `d${n}@example.com`,
  dedication: null,
  months,
});

describe.skipIf(!TEST_DATABASE_URL)("admin operations", () => {
  const db = TEST_DATABASE_URL ? testDb() : null!;

  beforeEach(async () => {
    await wipe(db);
    await db.bench.create({ data: { code: "PG-001", zone: "Parade Ground" } });
  });
  afterAll(async () => {
    await wipe(db);
    await db.$disconnect();
  });

  /** Current adoption [today, +12mo) followed by a reservation [+12mo, +24mo). */
  async function currentPlusRenewal() {
    await createAdoption(db, "PG-001", req(1), today);
    await createAdoption(db, "PG-001", req(2), parseDay("2027-09-22"));
    return db.adoption.findMany({ orderBy: { startDate: "asc" } });
  }

  it("shortening an adoption is allowed", async () => {
    const [first] = await currentPlusRenewal();
    const r = await updateAdoption(db, first.id, { endDate: "2027-03-01", dedication: "Updated" });
    expect(r).toEqual({ ok: true });
    const after = await db.adoption.findUniqueOrThrow({ where: { id: first.id } });
    expect(after.endDate).toEqual(parseDay("2027-03-01"));
    expect(after.dedication).toBe("Updated");
  });

  it("extending into the next adoption is rejected with a specific message", async () => {
    const [first] = await currentPlusRenewal();
    const r = await updateAdoption(db, first.id, { endDate: "2027-12-01", dedication: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/reserved starting Sep 22, 2027/);
  });

  it("an end date on or before the start date is rejected", async () => {
    const [first] = await currentPlusRenewal();
    const r = await updateAdoption(db, first.id, { endDate: "2026-09-22", dedication: "" });
    expect(r).toEqual({ ok: false, message: "The end date must be after the start date." });
  });

  it("admin edits apply the same dedication rules as the public form", async () => {
    const [first] = await currentPlusRenewal();
    const r = await updateAdoption(db, first.id, { endDate: "2027-09-22", dedication: "see www.spam.biz" });
    expect(r.ok).toBe(false);
  });

  it("cancelling frees the bench and allows a new adoption", async () => {
    await createAdoption(db, "PG-001", req(1, 60), today);
    const a = await db.adoption.findFirstOrThrow();
    expect(await cancelAdoption(db, a.id)).toEqual({ ok: true });
    expect((await cancelAdoption(db, a.id)).ok).toBe(false); // idempotent refusal

    const all = await db.adoption.findMany();
    expect(getBenchStatus(all, today).kind).toBe("AVAILABLE");
    expect((await createAdoption(db, "PG-001", req(2), today)).ok).toBe(true);
    expect(await db.adoption.count()).toBe(2); // history kept
  });

  it("retiring is refused while a bench has a current or upcoming adoption", async () => {
    await createAdoption(db, "PG-001", req(1), parseDay("2027-01-01")); // upcoming
    const r = await setBenchActive(db, "PG-001", false, today);
    expect(r.ok).toBe(false);
    await db.adoption.updateMany({ data: { cancelledAt: new Date() } });
    expect(await setBenchActive(db, "PG-001", false, today)).toEqual({ ok: true });
    expect((await db.bench.findUniqueOrThrow({ where: { code: "PG-001" } })).active).toBe(false);
  });

  it("creating a bench validates the code and refuses duplicates", async () => {
    const base = { zone: "Vault Hill", material: "", installedYear: "", notes: "" };
    expect((await createBench(db, { ...base, code: "vh-900" })).ok).toBe(true); // normalized to VH-900
    expect((await createBench(db, { ...base, code: "VH-900" })).ok).toBe(false);
    expect((await createBench(db, { ...base, code: "not a code" })).ok).toBe(false);
    expect((await createBench(db, { ...base, code: "VH-901", installedYear: "1700" })).ok).toBe(false);
  });

  it("the phase filter agrees with adoptionPhase()", async () => {
    await createAdoption(db, "PG-001", req(1), addDays(today, -400)); // ended
    await createAdoption(db, "PG-001", req(2), today); // current
    await createAdoption(db, "PG-001", req(3), parseDay("2027-09-22")); // upcoming
    await db.bench.create({ data: { code: "PG-002", zone: "Parade Ground" } });
    await createAdoption(db, "PG-002", req(4), today);
    await db.adoption.updateMany({ where: { donor: { email: "d4@example.com" } }, data: { cancelledAt: new Date() } });

    const all = await db.adoption.findMany();
    for (const phase of PHASES) {
      const { adoptions } = await listAdoptions(db, { phase }, today, "all");
      const expected = all.filter((a) => adoptionPhase(a, today) === phase).map((a) => a.id).sort();
      expect(adoptions.map((a) => a.id).sort(), phase).toEqual(expected);
      expect(expected.length, phase).toBe(1);
    }
  });
});
