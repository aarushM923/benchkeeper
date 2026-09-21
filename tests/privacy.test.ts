// DECISIONS #6: donor email must never reach the public. These tests hand the
// public projection a row that *does* contain an email (as if a future query
// over-selected) and check it still doesn't come out.

import { describe, expect, it } from "vitest";
import { parseDay } from "@/lib/dates";
import { toPublicBench, type BenchForPublic } from "@/lib/public";

const EMAIL = "secret.donor@example.com";
const asOf = parseDay("2026-09-21");

function overSelectedRow(): BenchForPublic {
  const donor = { displayName: "The Rivera Family", email: EMAIL, id: "donor_1" };
  return {
    code: "PG-001",
    zone: "Parade Ground",
    material: "Wood slat",
    installedYear: 2001,
    lat: 40.89,
    lng: -73.89,
    adoptions: [
      {
        startDate: parseDay("2025-01-01"),
        endDate: parseDay("2028-01-01"),
        cancelledAt: null,
        dedication: "Rest here, neighbor.",
        donor,
      },
      {
        startDate: parseDay("2028-01-01"),
        endDate: parseDay("2030-01-01"),
        cancelledAt: null,
        dedication: null,
        donor,
      },
    ],
  };
}

describe("toPublicBench", () => {
  it("never includes the donor's email, even if the input row has it", () => {
    const json = JSON.stringify(toPublicBench(overSelectedRow(), asOf));
    expect(json).not.toContain(EMAIL);
    expect(json).not.toContain("@");
    expect(json).not.toContain("donor_1");
  });

  it("does include display name, dedication, and the period (requirement a)", () => {
    const pub = toPublicBench(overSelectedRow(), asOf);
    expect(pub.status).toEqual({
      kind: "ADOPTED",
      expiringSoon: false,
      adoption: {
        displayName: "The Rivera Family",
        dedication: "Rest here, neighbor.",
        startDate: "2025-01-01",
        endDate: "2028-01-01",
        lastDay: "2027-12-31",
      },
    });
    expect(pub.upcoming.map((a) => a.startDate)).toEqual(["2028-01-01"]);
  });
});
