// The public projection: the ONLY shape of bench data that leaves the server
// for visitors. Every public page and API route goes through toPublicBench().
//
// Privacy (DECISIONS #6): donor email must never appear here. Two layers keep
// it out: public queries only select `donor.displayName` (see benches.ts), and
// this function builds its output field-by-field — never by spreading a DB row —
// so a column added later can't leak by accident.

import { getBenchStatus, type AdoptionLike } from "./availability";
import { formatDay, lastCoveredDay } from "./dates";

export interface PublicAdoption {
  displayName: string;
  dedication: string | null;
  startDate: string; // YYYY-MM-DD, first covered day
  endDate: string; // YYYY-MM-DD, exclusive: first free day
  lastDay: string; // YYYY-MM-DD, last covered day ("through ...")
}

export type PublicStatus =
  | { kind: "AVAILABLE" }
  | { kind: "ADOPTED"; adoption: PublicAdoption; expiringSoon: boolean }
  | { kind: "RESERVED"; adoption: PublicAdoption };

export interface PublicBench {
  code: string;
  zone: string;
  material: string | null;
  installedYear: number | null;
  lat: number | null;
  lng: number | null;
  status: PublicStatus;
  /** Booked adoptions after the current one (e.g. a queued renewal). */
  upcoming: PublicAdoption[];
}

/** What a public query must load for toPublicBench (see PUBLIC_BENCH_SELECT). */
export interface BenchForPublic {
  code: string;
  zone: string;
  material: string | null;
  installedYear: number | null;
  lat: number | null;
  lng: number | null;
  adoptions: (AdoptionLike & {
    dedication: string | null;
    donor: { displayName: string };
  })[];
}

type AdoptionForPublic = BenchForPublic["adoptions"][number];

function toPublicAdoption(a: AdoptionForPublic): PublicAdoption {
  return {
    displayName: a.donor.displayName,
    dedication: a.dedication,
    startDate: formatDay(a.startDate),
    endDate: formatDay(a.endDate),
    lastDay: formatDay(lastCoveredDay(a.endDate)),
  };
}

export function toPublicBench(bench: BenchForPublic, asOf: Date): PublicBench {
  const status = getBenchStatus(bench.adoptions, asOf);
  const shown = status.kind === "AVAILABLE" ? null : status.adoption;

  const upcoming = bench.adoptions
    .filter(
      (a) =>
        a.cancelledAt == null &&
        a !== shown &&
        a.startDate.getTime() > asOf.getTime(),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map(toPublicAdoption);

  let publicStatus: PublicStatus;
  switch (status.kind) {
    case "AVAILABLE":
      publicStatus = { kind: "AVAILABLE" };
      break;
    case "ADOPTED":
      publicStatus = {
        kind: "ADOPTED",
        adoption: toPublicAdoption(status.adoption),
        expiringSoon: status.expiringSoon,
      };
      break;
    case "RESERVED":
      publicStatus = { kind: "RESERVED", adoption: toPublicAdoption(status.adoption) };
      break;
  }

  return {
    code: bench.code,
    zone: bench.zone,
    material: bench.material,
    installedYear: bench.installedYear,
    lat: bench.lat,
    lng: bench.lng,
    status: publicStatus,
    upcoming,
  };
}
