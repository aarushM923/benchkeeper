# BenchKeeper

A web app for the Van Cortlandt Park bench adoption program: a single source of truth for
which of the park's 500+ benches are adopted, by whom, and for how long — and a way for anyone
to adopt one that's free.

**Live:** https://benchkeeper-7n71.vercel.app

- **Browse** — search by plaque code or park area, filter by status, page through 515 benches.
  Each bench shows whether it's available, or who adopted it, their dedication, and the dates.
- **Adopt** — pick an available bench, enter a display name, email, optional dedication, and a
  length (1, 2, or 5 years). No payment. You can also start later (up to a year ahead) to
  reserve a bench or renew one that's about to expire.
- **Map** — every bench on an OpenStreetMap map, colored by status.
- **Staff dashboard** (`/admin`) — every adoption with donor contact info; edit, cancel, add or
  retire benches; export to CSV. Demo-grade login (see [Admin](#admin)).

Try `?asOf=` on any list or bench page (e.g. [`/benches?asOf=2029-01-01`](https://benchkeeper-7n71.vercel.app/benches?asOf=2029-01-01))
to see what the program looks like on another date — it's the same code answering a different
question, which is the core idea of the whole design.

---

## Decisions & assumptions

The full list with one-line reasons is in [`DECISIONS.md`](DECISIONS.md). These are the ones
that shaped the app.

### 1. "Adopted" is a date range, not a boolean

The obvious model is an `adopted: true/false` column on each bench. It's wrong, and working out
why was the most important part of this project:

- An adoption **expires**. A boolean stays `true` until someone remembers to flip it.
- A bench can be **free today but booked from next month**, or adopted now and free next year.
  A boolean can only describe one moment.
- It throws away **history** — who had the bench before.

So a bench stores nothing about its status. Each adoption is a row with a `startDate` and
`endDate`, and status is **derived when you read it**, relative to an "as of" date that defaults
to today (`getBenchStatus` in [`src/lib/availability.ts`](src/lib/availability.ts)):

| Status | Meaning |
|---|---|
| `ADOPTED` | a live adoption covers the as-of date (flagged *expiring soon* within 60 days) |
| `RESERVED` | free on that date, but an adoption is booked to start later |
| `AVAILABLE` | nothing current or upcoming — including when every adoption has expired |

Because nothing is stored, nothing goes stale, and no nightly job is needed to "expire"
adoptions. The same function answers "is it free now?", "was it free last June?", and "will it
be free in 2029?". Adding advance reservations later needed **no schema change** — the model
already allowed future start dates.

### 2. Ranges are half-open: `[start, end)`

`endDate` is the **first day the bench is free again**, not the last day it's adopted. Two
ranges overlap when `aStart < bEnd && bStart < aEnd`. The payoff is at the boundary: an adoption
ending June 1 and a renewal starting June 1 **don't collide**, so back-to-back renewals just work.
With inclusive ranges they'd falsely conflict, or I'd need "+1 day" fixes scattered everywhere.

People think in inclusive terms, though, so the UI shows the last covered day: "adopted through
May 31". That conversion happens in exactly one place (`lastCoveredDay`).

### 3. Overlaps are prevented twice — and the second one matters

When someone adopts, the server loads the bench's adoptions inside a transaction and rejects any
overlap with a specific message ("Bench PG-014 is already adopted through Sep 21, 2028. It
becomes available on Sep 22, 2028.").

That check alone isn't safe: two people submitting at the same moment can both read "free" and
both insert. So the database enforces it too, with a Postgres **exclusion constraint** —
`EXCLUDE USING gist (benchId WITH =, daterange(startDate, endDate, '[)') WITH &&) WHERE
cancelledAt IS NULL` — which makes an overlapping insert impossible, and the app turns the
constraint error into the same friendly message.

I measured it: across 10 rounds of 8 simultaneous submissions for one bench, exactly one won each
time — and **63 of the 70 losers had already passed the app check**. Only the constraint stopped
them. Without it, the "single source of truth" would double-book benches under load.

### 4. Donor emails are never public — enforced in code, not just hidden

The brief says visitors should see "by whom", but a real program wouldn't publish donors'
contact details. The public sees the **display name** the donor chose, the dedication, and the
dates. Email is staff-only.

This is enforced at two layers, not by hiding a field in the UI: public queries only ever select
`donor.displayName`, and every public page and API response goes through one projection function
(`toPublicBench`) that builds its output field by field. A test feeds it a row that *does*
contain an email and checks nothing leaks.

### 5. "Today" means today in New York

Status flips at a day boundary, so which day it is matters. Dates are stored as Postgres `DATE`
(no time), and "today" is the park's calendar date in `America/New_York` — so a bench expiring
October 1 reads available on October 1 park time, even though Vercel's servers run in UTC.
I deliberately avoided a local-time date library, because on a laptop in New York it would shift
dates by a day relative to the server.

### Other assumptions

- **Synthetic data.** No dataset was provided, so the seed generates 520 benches across seven
  real park areas, with a realistic mix: never adopted, expired (reads available again), adopted,
  expiring soon, reserved, and renewed back-to-back. It's deterministic (fixed random seed) but
  anchored to the day it runs, so the demo never goes stale. Map pins are approximate points near
  each area, not surveyed locations.
- **Instant self-serve adoption**, no approval step — the brief says visitors adopt "themselves".
- **Donors are matched by email.** Adopting again with the same email reuses the donor (so staff
  see all their benches). The trade-off: a new display name also renames them on older adoptions.
- **Nothing is deleted.** Cancelling an adoption sets `cancelledAt`; retiring a bench sets
  `active = false`. History survives. A bench can't be retired while someone has it adopted or
  reserved.
- **Dedications**: max 140 characters (plaque-sized), no web addresses. A light guard, not
  moderation.
- **Reservations** can start up to a year ahead, so the calendar doesn't fill up years out.
- **No public "my benches" page.** Without donor accounts, a lookup by email would let anyone see
  what someone else adopted. Staff have a per-donor view instead.

---

## Admin

`/admin` is protected by a **single shared password** (`ADMIN_PASSWORD`) — demo-grade, as the
brief allows. There are no staff accounts. Logging in sets an 8-hour, httpOnly, signed cookie;
changing the password logs everyone out. If `ADMIN_PASSWORD` isn't set, admin is disabled — there
is no default password.

Every admin page, form action, and the CSV export checks the session itself (not just a layout
or middleware), because a server action is a public endpoint whatever page renders it. I tested
this by replaying a captured "cancel adoption" request without the cookie (refused) and with it
(applied).

**Reviewers:** the admin password for the live site is provided separately.

---

## Running locally

Requires **Node.js 20+** and a **PostgreSQL** database (a free [Neon](https://neon.tech)
database works, or any local Postgres). The exclusion constraint needs the `btree_gist`
extension, which Neon and standard Postgres both include.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL (and ADMIN_PASSWORD for /admin)
npm run db:deploy           # apply migrations
npm run db:seed             # 520 benches + adoptions (wipes existing data)
npm run dev                 # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Run the test suite |
| `npm run db:reset` | Drop, re-migrate, and reseed |
| `npm run db:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npm run typecheck` / `npm run lint` | Static checks |

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Neon, use the **pooled** URL for the app. |
| `ADMIN_PASSWORD` | for `/admin` | 8+ characters. Unset = admin disabled. |
| `TEST_DATABASE_URL` | for DB tests | A separate, disposable database. **The tests wipe it.** |

**Migrating Neon:** run migrations over the **direct** (non-`-pooler`) connection string; Prisma
Migrate takes advisory locks that don't work reliably through the connection pooler.

---

## Tests

```bash
npm test
```

73 tests. **50 run anywhere**; the other 23 need a real Postgres and run only when
`TEST_DATABASE_URL` is set (the test setup migrates it automatically).

- **Core logic** (`availability.test.ts`) — `rangesOverlap` and `getBenchStatus` across the cases
  that matter: adjacent ranges (end day = start day), full and partial overlap, expired adoptions
  reading available, future adoptions reading reserved, cancelled adoptions ignored, and the
  60-day "expiring soon" boundary.
- **SQL agrees with the pure function** (`status-filter.db.test.ts`) — the list filters status in
  the database, so the rules exist twice. This test builds 257 benches with random and edge-case
  histories and checks every filter returns exactly what `getBenchStatus` would. (I planted an
  off-by-one to confirm it fails when they drift.)
- **Adopting** (`adopt.db.test.ts`) — overlap rejected with the right message, back-to-back
  allowed, retired benches refused, and 8 concurrent submissions → exactly one winner.
- **Privacy** — no email in public output. **Admin** — session tampering, expiry, and password
  rotation; edits obey overlap rules; CSV export escapes spreadsheet formulas.

---

## How it's built

**Next.js 16** (App Router, Server Components, Server Actions) · **TypeScript** · **Prisma 7** ·
**PostgreSQL** (Neon) · **Tailwind CSS** · **Leaflet** + OpenStreetMap · **Vitest** · deployed on
**Vercel**.

I used Postgres in development as well as production. SQLite doesn't persist on Vercel's
serverless filesystem, and one database engine everywhere means no surprises at deploy time.

```
prisma/
  schema.prisma          Bench, Donor, Adoption — no status column anywhere
  migrations/            includes the hand-written exclusion constraint
  seed.ts                deterministic synthetic data
src/lib/
  availability.ts        ★ rangesOverlap, getBenchStatus — pure, no database
  dates.ts               calendar-day helpers, park time zone
  benches.ts             public queries; status filters as SQL
  public.ts              the public projection (where email is kept out)
  adopt.ts               validation + the adopt transaction
  admin.ts, auth.ts      staff operations and session handling
src/app/
  benches/               list, detail, adopt form
  map/                   map view
  admin/                 staff dashboard
  api/benches/           public JSON API
tests/
```

The core rule — what status a bench is in — lives in one small file with no database or framework
imports, so it can be tested exhaustively and reused by pages, the API, the map, and the adopt
flow.

---

## What I'd do with more time

- **Real staff accounts** (per-person logins, roles) and an **audit log** of who cancelled or
  edited what. Rate-limit the login properly instead of a fixed delay.
- **Donor accounts** with email verification, so donors could see and renew their own benches —
  and **renewal reminders** before an adoption expires.
- **Payments** and plaque-engraving workflow — excluded from this brief, but a real program
  needs them.
- **Snapshot the display name per adoption**, so renaming a donor never changes an existing
  plaque's text.
- **Smarter reservation suggestions** that find gaps between bookings, not just the date after
  the last one.
- **Real bench locations** from the Parks Department, and map clustering and filters.
- **End-to-end tests in CI.** I checked the flows in a headless browser by hand; I'd automate
  that with Playwright on every push.
