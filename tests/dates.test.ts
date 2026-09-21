import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatDay,
  lastCoveredDay,
  parseDay,
  today,
} from "@/lib/dates";

describe("parseDay / formatDay", () => {
  it("round-trips YYYY-MM-DD as UTC midnight", () => {
    const day = parseDay("2028-06-01");
    expect(day.toISOString()).toBe("2028-06-01T00:00:00.000Z");
    expect(formatDay(day)).toBe("2028-06-01");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => parseDay("2028-6-1")).toThrow();
    expect(() => parseDay("2027-02-29")).toThrow(); // not a leap year
    expect(() => parseDay("nope")).toThrow();
  });
});

describe("addMonths", () => {
  it("adds whole years", () => {
    expect(formatDay(addMonths(parseDay("2026-09-21"), 60))).toBe("2031-09-21");
  });

  it("clamps to the end of shorter months", () => {
    expect(formatDay(addMonths(parseDay("2026-01-31"), 1))).toBe("2026-02-28");
    expect(formatDay(addMonths(parseDay("2028-02-29"), 12))).toBe("2029-02-28");
  });
});

describe("today (park time, America/New_York)", () => {
  it("uses the New York calendar date, not UTC's", () => {
    // 02:30 UTC on Sep 22 is still 22:30 on Sep 21 in New York (EDT).
    expect(formatDay(today(new Date("2026-09-22T02:30:00Z")))).toBe("2026-09-21");
    // 05:00 UTC on Sep 22 is 01:00 Sep 22 in New York.
    expect(formatDay(today(new Date("2026-09-22T05:00:00Z")))).toBe("2026-09-22");
  });
});

describe("lastCoveredDay", () => {
  it("is the day before the exclusive end — what 'through' copy shows", () => {
    expect(formatDay(lastCoveredDay(parseDay("2028-06-01")))).toBe("2028-05-31");
  });
});
