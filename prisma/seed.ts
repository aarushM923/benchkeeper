// Synthetic, deterministic seed (DECISIONS #15).
//
// No real dataset was provided, so this generates ~520 benches across Van
// Cortlandt Park zones with a realistic mix of statuses. A fixed PRNG seed makes
// the data identical for the same run date; dates are anchored to "today" so the
// demo always shows a live mix (not everything expired a year from now).
//
// Coordinates are approximate points scattered near each zone — good enough for
// a future map view, not survey data.
//
// Run: npm run db:seed   (wipes and reseeds; npm run db:reset also re-migrates)

import "dotenv/config";
import { createPrisma } from "../src/lib/db";
import { addDays, addMonths, formatDay, today } from "../src/lib/dates";

// ---------------------------------------------------------------- randomness

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

// ---------------------------------------------------------------- reference data

const ZONES = [
  { prefix: "PG", name: "Parade Ground", count: 110, lat: 40.8893, lng: -73.8888 },
  { prefix: "LK", name: "Van Cortlandt Lake", count: 90, lat: 40.8958, lng: -73.8925 },
  { prefix: "PT", name: "Putnam Trail", count: 75, lat: 40.9012, lng: -73.8916 },
  { prefix: "JK", name: "John Kieran Nature Trail", count: 70, lat: 40.8948, lng: -73.8903 },
  { prefix: "HS", name: "Van Cortlandt House", count: 60, lat: 40.8889, lng: -73.8953 },
  { prefix: "TB", name: "Tibbetts Brook", count: 60, lat: 40.9030, lng: -73.8935 },
  { prefix: "VH", name: "Vault Hill", count: 55, lat: 40.8985, lng: -73.8848 },
] as const;

const MATERIALS = ["Wood slat", "Wood slat", "Recycled plastic", "Cast iron & wood", "Concrete"];

const FIRST = [
  "Maria", "James", "Aisha", "Wei", "Carlos", "Priya", "Daniel", "Fatima", "Kevin", "Rosa",
  "Samuel", "Nadia", "Michael", "Yuki", "Andre", "Grace", "Luis", "Hannah", "Omar", "Elena",
  "Patrick", "Mei", "Jamal", "Sofia", "Thomas", "Ines", "David", "Keisha", "Ivan", "Lucia",
];
const LAST = [
  "Rivera", "O'Brien", "Chen", "Johnson", "Patel", "Goldberg", "Nguyen", "Santos", "Murphy",
  "Kim", "Williams", "Haddad", "Kowalski", "Reyes", "Okafor", "Brennan", "Lopez", "Fischer",
  "Singh", "Morales", "Cohen", "Ali", "Garcia", "Walsh", "Yamamoto",
];
const ORGS = [
  "Riverdale Running Club",
  "Friends of Van Cortlandt Park",
  "Bronx Birders",
  "Kingsbridge Rotary",
  "Manhattan College Class of 1998",
  "Van Cortlandt Track Club",
  "Tibbetts Brook Neighbors",
  "Fieldston Garden Society",
];
const DEDICATIONS = [
  (f: string) => `In loving memory of ${f}, who walked here every morning.`,
  (f: string) => `For ${f} — rest your feet, you've earned it.`,
  (f: string) => `Happy 50th, ${f}! Love, the whole family.`,
  (f: string) => `In honor of ${f}, who taught us to love this park.`,
  () => "For everyone who runs the Back Hills.",
  () => "Sit a while. Watch the herons.",
  () => "Where we got engaged — June 2011.",
  () => "Rest here, neighbor.",
];

// ---------------------------------------------------------------- generation

interface SeedAdoption {
  benchCode: string;
  donorEmail: string;
  startDate: Date;
  endDate: Date;
  dedication: string | null;
}

function makeDonors(n: number) {
  const donors: { displayName: string; email: string }[] = [];
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const style = rand();
    const displayName =
      style < 0.12
        ? pick(ORGS)
        : style < 0.3
          ? `The ${last} Family`
          : style < 0.4
            ? `${first[0]}. ${last}`
            : `${first} ${last}`;
    const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    donors.push({ displayName, email: `${slug}.${i + 1}@example.com` });
  }
  return donors;
}

function dedication(): string | null {
  return rand() < 0.6 ? pick(DEDICATIONS)(pick(FIRST)) : null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createPrisma(url);
  const asOf = today();

  const donors = makeDonors(280);
  const donor = () => pick(donors).email;

  const benches: {
    code: string;
    zone: string;
    lat: number;
    lng: number;
    material: string;
    installedYear: number;
    active: boolean;
  }[] = [];
  const adoptions: SeedAdoption[] = [];

  const add = (benchCode: string, email: string, start: Date, months: number) => {
    const end = addMonths(start, months);
    adoptions.push({ benchCode, donorEmail: email, startDate: start, endDate: end, dedication: dedication() });
    return end;
  };

  for (const zone of ZONES) {
    for (let i = 1; i <= zone.count; i++) {
      const code = `${zone.prefix}-${String(i).padStart(3, "0")}`;
      benches.push({
        code,
        zone: zone.name,
        lat: +(zone.lat + (rand() - 0.5) * 0.005).toFixed(6),
        lng: +(zone.lng + (rand() - 0.5) * 0.005).toFixed(6),
        material: pick(MATERIALS),
        installedYear: randInt(1988, 2024),
        active: true,
      });

      const r = rand();
      if (r < 0.34) {
        // Never adopted → AVAILABLE.
      } else if (r < 0.44) {
        // Expired only → reads AVAILABLE again.
        const months = pick([12, 24, 60]);
        const end = addDays(asOf, -randInt(1, 700));
        add(code, donor(), addMonths(end, -months), months);
      } else if (r < 0.82) {
        // Currently ADOPTED, sometimes with an older, back-to-back predecessor.
        const months = pick([12, 24, 24, 60, 60, 120]);
        const coveredDays = Math.round((months / 12) * 365);
        let start = addDays(asOf, -randInt(0, coveredDays - 1));
        if (addMonths(start, months).getTime() <= asOf.getTime()) start = asOf;
        if (rand() < 0.35) {
          // Predecessor ends exactly when this one starts: adjacent, not overlapping.
          const prevMonths = pick([12, 24]);
          add(code, donor(), addMonths(start, -prevMonths), prevMonths);
        }
        add(code, donor(), start, months);
      } else if (r < 0.9) {
        // ADOPTED and expiring within 60 days.
        const months = pick([12, 24, 60]);
        const end = addDays(asOf, randInt(1, 60));
        add(code, donor(), addMonths(end, -months), months);
      } else if (r < 0.95) {
        // RESERVED: free today, adoption booked to start later.
        if (rand() < 0.5) {
          const end = addDays(asOf, -randInt(30, 400));
          add(code, donor(), addMonths(end, -12), 12);
        }
        add(code, donor(), addDays(asOf, randInt(7, 150)), pick([12, 24, 60]));
      } else if (r < 0.98) {
        // ADOPTED with a renewal queued by the same donor, starting the day it ends.
        const email = donor();
        const end = addDays(asOf, randInt(20, 200));
        const months = pick([12, 24]);
        add(code, email, addMonths(end, -months), months);
        add(code, email, end, pick([12, 24, 60]));
      }
      // else: never adopted.
    }
  }

  // A few retired benches: hidden from the public, history kept.
  for (const code of ["PG-107", "LK-044", "TB-058", "VH-012", "HS-031"]) {
    const bench = benches.find((b) => b.code === code)!;
    bench.active = false;
  }

  // Only create donors who actually adopted something.
  const usedEmails = new Set(adoptions.map((a) => a.donorEmail));
  const usedDonors = donors.filter((d) => usedEmails.has(d.email));

  await db.$transaction(async (tx) => {
    await tx.adoption.deleteMany();
    await tx.donor.deleteMany();
    await tx.bench.deleteMany();

    const benchRows = await tx.bench.createManyAndReturn({
      data: benches,
      select: { id: true, code: true },
    });
    const donorRows = await tx.donor.createManyAndReturn({
      data: usedDonors,
      select: { id: true, email: true },
    });
    const benchId = new Map(benchRows.map((b) => [b.code, b.id]));
    const donorId = new Map(donorRows.map((d) => [d.email, d.id]));

    await tx.adoption.createMany({
      data: adoptions.map((a) => ({
        benchId: benchId.get(a.benchCode)!,
        donorId: donorId.get(a.donorEmail)!,
        startDate: a.startDate,
        endDate: a.endDate,
        dedication: a.dedication,
      })),
    });
  }, { timeout: 60_000 });

  console.log(
    `Seeded ${benches.length} benches, ${usedDonors.length} donors, ` +
      `${adoptions.length} adoptions (as of ${formatDay(asOf)}).`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
