import { describe, expect, it } from "vitest";
import {
  adoptionPhase,
  EXPIRING_SOON_DAYS,
  findConflict,
  getBenchStatus,
  nextOpenStart,
  rangesOverlap,
  type AdoptionLike,
} from "@/lib/availability";
import { addDays, parseDay as d } from "@/lib/dates";

const adoption = (
  start: string,
  end: string,
  extra: Partial<AdoptionLike> & { id?: string } = {},
) => ({ id: `${start}..${end}`, startDate: d(start), endDate: d(end), ...extra });

describe("rangesOverlap — half-open [start, end)", () => {
  const A = [d("2025-01-01"), d("2026-01-01")] as const;

  it("adjacent ranges do NOT overlap (one ends the day the next begins)", () => {
    expect(rangesOverlap(...A, d("2026-01-01"), d("2027-01-01"))).toBe(false);
    expect(rangesOverlap(d("2024-01-01"), d("2025-01-01"), ...A)).toBe(false);
  });

  it("a one-day overlap at the boundary DOES overlap", () => {
    expect(rangesOverlap(...A, d("2025-12-31"), d("2027-01-01"))).toBe(true);
  });

  it("fully contained / fully containing / identical ranges overlap", () => {
    expect(rangesOverlap(...A, d("2025-03-01"), d("2025-04-01"))).toBe(true);
    expect(rangesOverlap(...A, d("2024-01-01"), d("2030-01-01"))).toBe(true);
    expect(rangesOverlap(...A, ...A)).toBe(true);
  });

  it("partial overlaps from either side overlap", () => {
    expect(rangesOverlap(...A, d("2024-06-01"), d("2025-06-01"))).toBe(true);
    expect(rangesOverlap(...A, d("2025-06-01"), d("2026-06-01"))).toBe(true);
  });

  it("disjoint ranges with a gap do not overlap", () => {
    expect(rangesOverlap(...A, d("2027-01-01"), d("2028-01-01"))).toBe(false);
  });

  it("is symmetric", () => {
    const B = [d("2025-06-01"), d("2026-06-01")] as const;
    expect(rangesOverlap(...A, ...B)).toBe(rangesOverlap(...B, ...A));
  });
});

describe("getBenchStatus", () => {
  const asOf = d("2026-09-21");

  it("no adoptions → AVAILABLE", () => {
    expect(getBenchStatus([], asOf)).toEqual({ kind: "AVAILABLE" });
  });

  it("an adoption covering asOf → ADOPTED, with that adoption", () => {
    const a = adoption("2025-01-01", "2028-01-01");
    expect(getBenchStatus([a], asOf)).toEqual({
      kind: "ADOPTED",
      adoption: a,
      expiringSoon: false,
    });
  });

  it("expired adoption → reads AVAILABLE again", () => {
    expect(getBenchStatus([adoption("2020-01-01", "2025-01-01")], asOf).kind).toBe(
      "AVAILABLE",
    );
  });

  it("the end date itself is free (half-open): adoption ending today → AVAILABLE", () => {
    expect(getBenchStatus([adoption("2021-09-21", "2026-09-21")], asOf).kind).toBe(
      "AVAILABLE",
    );
  });

  it("the start date itself is covered: adoption starting today → ADOPTED", () => {
    expect(getBenchStatus([adoption("2026-09-21", "2027-09-21")], asOf).kind).toBe(
      "ADOPTED",
    );
  });

  it("future-dated adoption only → RESERVED, with the earliest upcoming one", () => {
    const later = adoption("2027-06-01", "2028-06-01");
    const sooner = adoption("2026-11-01", "2027-06-01");
    expect(getBenchStatus([later, sooner], asOf)).toEqual({
      kind: "RESERVED",
      adoption: sooner,
    });
  });

  it("current + back-to-back renewal → ADOPTED by the current one", () => {
    const current = adoption("2024-01-01", "2026-12-01");
    const renewal = adoption("2026-12-01", "2031-12-01");
    const status = getBenchStatus([renewal, current], asOf);
    expect(status.kind).toBe("ADOPTED");
    if (status.kind === "ADOPTED") expect(status.adoption).toBe(current);
  });

  it("the same bench changes status as asOf moves through time", () => {
    const history = [
      adoption("2020-01-01", "2022-01-01"),
      adoption("2027-01-01", "2029-01-01"),
    ];
    expect(getBenchStatus(history, d("2021-06-01")).kind).toBe("ADOPTED");
    expect(getBenchStatus(history, d("2024-06-01")).kind).toBe("RESERVED");
    expect(getBenchStatus(history, d("2028-06-01")).kind).toBe("ADOPTED");
    expect(getBenchStatus(history, d("2030-06-01")).kind).toBe("AVAILABLE");
  });

  it("cancelled adoptions are ignored", () => {
    const cancelled = adoption("2025-01-01", "2028-01-01", {
      cancelledAt: new Date("2025-02-01T12:00:00Z"),
    });
    expect(getBenchStatus([cancelled], asOf).kind).toBe("AVAILABLE");
  });

  describe("expiringSoon", () => {
    it(`is true when the bench frees up within ${EXPIRING_SOON_DAYS} days`, () => {
      const a = adoption("2025-01-01", "2026-10-01");
      const status = getBenchStatus([a], asOf);
      expect(status.kind === "ADOPTED" && status.expiringSoon).toBe(true);
    });

    it("boundary: exactly EXPIRING_SOON_DAYS left → true; one more → false", () => {
      const at = adoption("2025-01-01", "2026-09-21");
      const atEnd = { ...at, endDate: addDays(asOf, EXPIRING_SOON_DAYS) };
      const past = { ...at, endDate: addDays(asOf, EXPIRING_SOON_DAYS + 1) };
      const s1 = getBenchStatus([atEnd], asOf);
      const s2 = getBenchStatus([past], asOf);
      expect(s1.kind === "ADOPTED" && s1.expiringSoon).toBe(true);
      expect(s2.kind === "ADOPTED" && s2.expiringSoon).toBe(false);
    });
  });
});

describe("findConflict", () => {
  const existing = [
    adoption("2024-01-01", "2026-01-01"),
    adoption("2027-01-01", "2028-01-01"),
  ];

  it("returns null when the proposed range fits in a gap exactly", () => {
    expect(
      findConflict(existing, { startDate: d("2026-01-01"), endDate: d("2027-01-01") }),
    ).toBeNull();
  });

  it("returns the earliest overlapping adoption", () => {
    const conflict = findConflict(existing, {
      startDate: d("2025-06-01"),
      endDate: d("2027-06-01"),
    });
    expect(conflict).toBe(existing[0]);
  });

  it("ignores cancelled adoptions", () => {
    const cancelled = [
      adoption("2025-01-01", "2030-01-01", { cancelledAt: new Date() }),
    ];
    expect(
      findConflict(cancelled, { startDate: d("2026-01-01"), endDate: d("2027-01-01") }),
    ).toBeNull();
  });
});

describe("adoptionPhase", () => {
  const asOf = d("2026-09-21");
  it("classifies relative to asOf, with cancellation taking precedence", () => {
    expect(adoptionPhase(adoption("2026-01-01", "2027-01-01"), asOf)).toBe("CURRENT");
    expect(adoptionPhase(adoption("2026-09-22", "2027-01-01"), asOf)).toBe("UPCOMING");
    expect(adoptionPhase(adoption("2025-01-01", "2026-09-21"), asOf)).toBe("ENDED"); // end exclusive
    expect(
      adoptionPhase(adoption("2026-01-01", "2027-01-01", { cancelledAt: new Date() }), asOf),
    ).toBe("CANCELLED");
  });
});

describe("nextOpenStart", () => {
  const asOf = d("2026-09-22");
  it("is asOf when nothing is booked (or only past/cancelled adoptions)", () => {
    expect(nextOpenStart([], asOf)).toEqual(asOf);
    expect(nextOpenStart([adoption("2020-01-01", "2021-01-01")], asOf)).toEqual(asOf);
    expect(
      nextOpenStart([adoption("2026-01-01", "2030-01-01", { cancelledAt: new Date() })], asOf),
    ).toEqual(asOf);
  });

  it("is the end of the last live booking — current or upcoming", () => {
    expect(nextOpenStart([adoption("2026-01-01", "2027-03-01")], asOf)).toEqual(d("2027-03-01"));
    expect(
      nextOpenStart([adoption("2026-01-01", "2027-03-01"), adoption("2027-03-01", "2029-03-01")], asOf),
    ).toEqual(d("2029-03-01"));
    // Reserved (free now): a start today would run into the reservation.
    expect(nextOpenStart([adoption("2026-11-01", "2027-11-01")], asOf)).toEqual(d("2027-11-01"));
  });

  it("starting there never conflicts, whatever the length", () => {
    const booked = [adoption("2026-01-01", "2027-03-01"), adoption("2027-06-01", "2028-06-01")];
    const start = nextOpenStart(booked, asOf);
    expect(findConflict(booked, { startDate: start, endDate: d("2040-01-01") })).toBeNull();
  });
});
