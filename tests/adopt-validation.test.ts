import { describe, expect, it } from "vitest";
import { DEDICATION_MAX, MAX_LEAD_DAYS, validateAdoption as validate } from "@/lib/adopt";
import { addDays, formatDay, parseDay } from "@/lib/dates";

const today = parseDay("2026-09-22");
const validateAdoption = (input: Parameters<typeof validate>[0]) => validate(input, today);

const good = {
  displayName: "  The Rivera   Family ",
  email: " Maria.Rivera@Example.com ",
  dedication: "Rest here, neighbor.",
  months: "24",
};

describe("validateAdoption", () => {
  it("accepts good input and normalizes it", () => {
    expect(validateAdoption(good)).toEqual({
      ok: true,
      value: {
        displayName: "The Rivera Family",
        email: "maria.rivera@example.com",
        dedication: "Rest here, neighbor.",
        months: 24,
        startDate: today, // omitted start date means today
      },
    });
  });

  it("treats a blank dedication as none", () => {
    const r = validateAdoption({ ...good, dedication: "   " });
    expect(r.ok && r.value.dedication).toBeNull();
  });

  it("requires a name and a well-formed email", () => {
    const r = validateAdoption({ ...good, displayName: " ", email: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["displayName", "email"]);
  });

  it(`caps dedications at ${DEDICATION_MAX} characters`, () => {
    expect(validateAdoption({ ...good, dedication: "x".repeat(DEDICATION_MAX) }).ok).toBe(true);
    expect(validateAdoption({ ...good, dedication: "x".repeat(DEDICATION_MAX + 1) }).ok).toBe(false);
  });

  it("rejects web addresses in dedications", () => {
    for (const dedication of ["visit https://spam.example", "www.buy-now.biz", "go to cheapdeals.com"]) {
      expect(validateAdoption({ ...good, dedication }).ok).toBe(false);
    }
  });

  it("strips control characters", () => {
    const r = validateAdoption({ ...good, displayName: "Ana\u0000\u0007 Lopez" });
    expect(r.ok && r.value.displayName).toBe("Ana Lopez");
  });

  it("accepts 1–120 whole months only", () => {
    for (const months of ["1", "12", "60", "120"]) {
      expect(validateAdoption({ ...good, months }).ok).toBe(true);
    }
    for (const months of ["0", "121", "1.5", "-12", "", "abc", undefined]) {
      expect(validateAdoption({ ...good, months }).ok).toBe(false);
    }
  });

  describe("start date (advance reservations)", () => {
    it("accepts today through MAX_LEAD_DAYS ahead", () => {
      for (const day of [today, addDays(today, 1), addDays(today, MAX_LEAD_DAYS)]) {
        const r = validateAdoption({ ...good, startDate: formatDay(day) });
        expect(r.ok && r.value.startDate).toEqual(day);
      }
    });

    it("rejects past dates, dates too far ahead, and malformed dates", () => {
      for (const startDate of [
        formatDay(addDays(today, -1)),
        formatDay(addDays(today, MAX_LEAD_DAYS + 1)),
        "2026-02-30",
        "next tuesday",
      ]) {
        const r = validateAdoption({ ...good, startDate });
        expect(r.ok, startDate).toBe(false);
        if (!r.ok) expect(Object.keys(r.errors)).toEqual(["startDate"]);
      }
    });
  });
});
