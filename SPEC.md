# SPEC.md — Bench Adoption Program

> **How to use this file:** Rename it to `SPEC.md` in the root of a fresh repo. Your first
> message to Claude Code points at it (see "Driving Claude Code" at the bottom). It's the
> source of truth for scope. Before you build, read **Section 1** and lock every choice —
> those are *your* decisions, not the tool's, and "explain your decisions" is graded. This
> file also doubles as documentation of your thinking. Project referred to below as
> **BenchKeeper** (rename freely).

---

## 0. Context & goal

Van Cortlandt Park runs a bench adoption program covering **500+ benches**. Donors adopt a
bench for a set number of months/years. Today there's **no single source of truth** for
which benches are adopted, by whom, for how long, and which are still available.

**Goal:** a web app where anyone can:
- **(a)** browse benches and see, for each, whether it's adopted — and if so **by whom and
  for how long** — or that it's available; and
- **(b)** **adopt an available bench** themselves (no payment feature required).

**The core insight — don't model "adopted" as a boolean.** A bench's availability is a
function of *time*: it's available now if no adoption's date range covers today; it may be
adopted now but free next year, or free now but reserved from next month. Getting this
right — modeling adoptions as **date ranges**, deriving status, and **preventing
overlapping adoptions** — is what separates a thoughtful build from a to-do list with extra
steps. This is the heart of the assignment.

**Grading criteria to optimize for (from the employer):** it works; how it's structured;
what assumptions you made; how clearly you can explain your decisions. Polish is welcome but
not the point. Don't gold-plate.

---

## 1. DECISIONS TO CONFIRM BEFORE BUILDING  ← do this first, it's yours

These are the choices this spec assumes. **Confirm or change each.** You must be able to say
*why* in your README and an interview. Recommended default in **bold**; alternative + tradeoff
follows. Record your answers in a `DECISIONS.md` (one line + reason each) as you go — that's
your interview cheat-sheet and a strong signal to graders.

1. **Availability model (the big one).** → **Store adoptions as date ranges
   (`startDate`/`endDate`) and *derive* a bench's status from them.** Alt: a boolean
   `adopted` flag on the bench (simpler, but can't express expiry, upcoming reservations, or
   history — it's the wrong model, and being able to explain *why* it's wrong is the point).
   *Why it matters:* every view and the adopt flow depend on this.

2. **Status derivation.** → **Compute status on read** from the adoptions (`AVAILABLE`,
   `ADOPTED`, optionally `RESERVED`/`EXPIRING_SOON`), relative to an "as of" date (default
   today). Alt: store a status column updated by a scheduled job (introduces staleness and a
   job to run — avoid unless you want to justify it). *Why:* derived status can't go stale.

3. **Adopter modeling.** → **A lightweight `Donor` entity** (name, email) referenced by
   adoptions, so one donor can adopt several benches / renew. Alt: inline adopter fields on
   each adoption (fewer tables, but no "my benches" / renewal story). Pick based on how much
   you want a donor-centric feature later.

4. **Adopt timing.** → **MVP: adoption starts today**, duration chosen from a set of options
   (e.g. 1 / 2 / 5 years); store it as a real date range so the model is future-proof. Alt:
   allow future start dates (advance reservations) — nice, but adds date-picker + overlap
   edge cases; make it a stretch, not MVP.

5. **Self-serve vs approval.** → **Instant self-serve adoption** (matches the brief:
   "adopt a bench themselves"). Alt: request → admin approves (more realistic, more scope) —
   stretch only.

6. **Privacy — what's public.** → **Public sees the adopter's display name, optional
   dedication text, and the adoption period; email is admin-only.** Alt: show only an
   anonymized dedication. *Why:* requirement (a) says show "by whom," but real programs don't
   expose donors' contact info — surfacing this decision is exactly the kind of judgment
   being graded.

7. **Map view.** → **Out of MVP; list + filter + search is the core.** Alt: include a map
   (Leaflet + OpenStreetMap, no API key) as a stretch. *Why:* 500 benches are found faster by
   search/filter than by panning a map, and a map needs coordinate seed data (see §7).

8. **Database in dev vs prod.** → **Postgres (hosted, e.g. Neon free tier) for both**, via
   Prisma, so there's no dev/prod mismatch. Alt: SQLite locally + Postgres in prod (fast
   local start, but a Prisma provider swap and a real gotcha — see §8). *Why:* SQLite does
   **not** persist on serverless hosts like Vercel.

---

## 2. Users & roles

- **Visitor (public, no login):** browse/search/filter benches; open a bench to see its
  status, and if adopted, the adopter's display name, dedication, and period; adopt an
  available bench via a simple form.
- **Admin/staff (lightweight login):** see everything including donor contact info; manage
  benches (CRUD); view/edit/cancel adoptions; the operational "source of truth" the program
  currently lacks.
- Demo-grade admin auth is fine (seeded admin + simple login, or a role switch for the demo).
  Say so honestly in the README. The **public browse + adopt flow needs no login.**

---

## 3. Data model

Prisma-style sketch — a starting point, adjust to your confirmed decisions.

```
Bench       id, code (human-facing plaque/ID, unique), zone (park area),
            lat?, lng?,                       // optional; needed only for the map stretch
            material?, installedYear?, notes?,
            active (bool),                    // soft-delete / retired benches
            createdAt

Donor       id, displayName, email, createdAt
            // per Decision 3; drop if you go inline

Adoption    id, benchId→Bench, donorId→Donor,
            startDate, endDate,               // the date range — the crux
            dedication? (string, public plaque text),
            createdAt
            // a bench's status is DERIVED from its adoptions, never stored on the bench
```

**Relationships & rules**
- A bench has many adoptions over time (history); at most **one active adoption per instant**
  — enforced by the overlap check in §6, not by a column.
- **Never store `adopted` on the bench.** Availability is computed (Decision 1/2).
- Retiring a bench → soft-delete (`active=false`) so historical adoptions survive.
- Deleting/cancelling an adoption is an admin action; keep it auditable-ish (at least
  `createdAt`; a `cancelledAt` is a fine touch).

---

## 4. Features & pages, by phase

Build phase by phase. **Don't start a phase until the previous one runs.** Commit at each
boundary.

### Phase 0 — Skeleton
- Scaffold app + DB + Prisma schema (Bench, Donor, Adoption) + one migration + a health-check
  page that reads the DB. Prove the stack works end to end before features. Do a throwaway
  deploy now (see §8) so config problems surface early.

### Phase 1 — Browse & view  (satisfies requirement **a**)
- **Bench list:** all benches with derived status shown clearly (Available / Adopted, and if
  adopted, until when). Must handle 500+ gracefully: **search** (by code/zone) + **filters**
  (status, zone) + **pagination or a virtualized list** — don't dump 500 rows unbounded.
- **Bench detail page:** status; if adopted, adopter **display name + dedication + period**;
  if available, a prominent "Adopt this bench" entry point.

### Phase 2 — Adopt flow  (satisfies requirement **b**; the differentiator lives here)
- From an available bench: a form — adopter name, email, optional dedication, duration → on
  submit, create the adoption with the **overlap check** (§6) and show the bench as adopted.
- Friendly, specific errors (e.g. "This bench is already adopted through 2028-06-01").
- **Write the overlap/availability tests here** (§6, §9).

### Phase 3 — Stretch (only if 1 + 2 are solid **and deployed**)
- **Admin dashboard:** all adoptions with contact info; add/edit/cancel; bench CRUD.
- **Map view:** Leaflet + OpenStreetMap, benches colored by status (needs lat/lng seed).
- **Renewal / advance reservation** (future start dates), **"expiring soon"** surfacing,
  **donor view** ("benches I've adopted"), CSV export of adoptions for staff.

---

## 5. Validation & business rules

- Duration within sane bounds (e.g. ≥ 1 month, ≤ 10 years); compute `endDate` from
  `startDate` + duration.
- No **overlapping** adoptions for the same bench (§6) — enforce **server-side**, not just in
  the UI.
- Required, well-formed adopter name + email; trim/limit dedication length; consider a light
  guard on dedication text (note it, don't over-build moderation).
- Availability is always evaluated relative to an **"as of" date** (default: today), so the
  same logic answers "is it free now?" and "was it free on X?".
- Privacy: public responses must **omit donor email** (Decision 6). Enforce this at the API
  layer, not just by hiding it in the UI.

---

## 6. Core algorithm (get this right and tested)

Two small functions carry the whole system:

1. **`rangesOverlap(aStart, aEnd, bStart, bEnd)`** — the classic half-open interval test:
   `aStart < bEnd && bStart < aEnd`. Decide and document whether ranges are inclusive or
   half-open (recommend **half-open**: `[start, end)`, so an adoption ending on the 1st and a
   new one starting on the 1st don't falsely collide). This edge case is a great thing to
   mention in the interview.
2. **`getBenchStatus(bench, adoptions, asOf = today)`** → `AVAILABLE` | `ADOPTED` (with the
   covering adoption) | optionally `RESERVED` (adoption starts in the future). Pure function
   of the adoptions and the date.

The adopt flow calls `rangesOverlap` against the bench's existing adoptions before inserting;
reject on any overlap.

**Unit-test both**, including the adjacent-boundary case (adoption ends the same day another
begins), a fully-overlapping case, an expired adoption (bench reads available again), and a
future-dated one. This is where a test clearly signals quality — worth more than UI tests.

---

## 7. Seed data

No dataset was provided, so **generate realistic synthetic seed** (this is itself a decision —
say so). Aim for a demo that looks alive:
- **500+ benches** across a handful of named Van Cortlandt Park zones (e.g. Parade Ground,
  Vault Hill, the Lake, Van Cortlandt House, Putnam Trail, Tibbetts Brook, John Kieran Nature
  Trail). Give each a unique `code`.
- A realistic **mix of statuses**: a good chunk available, many adopted (varied end dates,
  some expiring soon), a few expired (should read available again), and — if you built it —
  a few future/reserved.
- Synthetic donors + dedications.
- If doing the map stretch, scatter **lat/lng within the park's bounding box** so pins land
  in roughly the right place (they don't need to be survey-accurate — note that assumption).
- Make it **deterministic** (fixed random seed) and provide one command to reset + reseed.

---

## 8. Tech stack & deployment

**Recommended stack** (fast solo, Claude Code is fluent in it, easy public URL):
- **Next.js (App Router) + TypeScript**; server actions / route handlers for the API.
- **Prisma** ORM · **PostgreSQL** hosted (Neon free tier) per Decision 8.
- **Tailwind** for styling — clean and minimal; polish isn't the point.
- Map stretch: **Leaflet + OpenStreetMap** tiles (no API key).
- Deploy to **Vercel**.

Swap to a stack you know better if it lets you explain faster (e.g. FastAPI/Flask + React on
Render). Optimize for defensibility, not novelty.

**Deployment must produce a live, publicly accessible URL** (hard requirement, due tomorrow
11:59 PM):
- **SQLite on Vercel does not persist** — serverless filesystem is ephemeral, writes vanish.
  That's why the spec uses hosted Postgres. If you dev on SQLite anyway, budget for the Prisma
  provider swap and test a real write on the *deployed* URL, not just locally.
- Set the production `DATABASE_URL` as an env var; run migration + seed against prod before
  submitting.
- **Leave ~30 minutes for deploy**, and do the throwaway deploy at the end of Phase 0 so you
  hit config issues today, not at 11pm tomorrow.

---

## 9. Testing

- **Required:** unit tests for `rangesOverlap` and `getBenchStatus` (§6), covering the
  boundary/expired/future cases.
- **Nice-to-have:** a test that the adopt endpoint rejects an overlapping adoption, and that
  the public API never leaks donor email.
- Skip exhaustive UI testing — out of scope for the time budget.

---

## 10. Repo hygiene & README (graded)

- Sensible commit history — at least one commit per phase, meaningful messages.
- `.env.example` with required vars; never commit real secrets.
- **README.md** must include: what it is; how to run locally (install, env, migrate, seed,
  dev); the **live URL**; a **"Decisions & assumptions"** section (from your `DECISIONS.md` —
  maps directly to grading); and **"What I'd do with more time."**
- Write "Decisions & assumptions" **in your own words** — that's what you'll be asked about.
  Lead with the availability-as-a-date-range decision; it's your strongest point.

---

## 11. Non-goals (scope fence — do NOT build these)

- **Payments / checkout** (explicitly excluded by the brief).
- Donor accounts with real auth/passwords, email verification, notifications/reminders.
- Plaque ordering/engraving fulfillment, inventory, or physical-work tracking.
- Survey-accurate GIS coordinates; the map (if built) uses approximate synthetic pins.
- Content moderation pipeline for dedication text (a length cap + light guard is enough).
- Multi-park / multi-org support, i18n, native mobile app.

Feel the urge to build one of these? Put it in "What I'd do with more time" instead.

---

## 12. Definition of done

- [ ] Anyone can browse 500+ benches with working search + filters, performant.
- [ ] A bench page shows accurate derived status; if adopted, shows adopter display name,
      dedication, and period (never the email).
- [ ] A visitor can adopt an available bench; overlapping adoptions are rejected server-side.
- [ ] `rangesOverlap` and `getBenchStatus` have passing unit tests incl. boundary cases.
- [ ] Seed produces a lively, reproducible mix of statuses across ~500 benches.
- [ ] Deployed to a live public URL with a working, persistent database.
- [ ] README documents setup, the live URL, and your decisions/assumptions in your words.

---

## Driving Claude Code (same workflow as before, adapted)

Setup, phase discipline, commit-per-phase, deploy-early, and README-last are identical to the
process you already have. The only change is the kickoff message — there's no source form to
attach for this one:

```
Read SPEC.md and DECISIONS.md in full. Don't write any code yet.
Then give me: (1) the goal in 3-4 sentences, (2) your exact tech choices and folder
structure, (3) a phase-by-phase plan matching SPEC.md, and (4) any ambiguities or
places where SPEC.md and DECISIONS.md conflict. Pay special attention to how you'll
model bench availability as date ranges (SPEC.md section 6) rather than a boolean.
Wait for my go-ahead before writing code.
```

Then: build Phase 0 → verify → commit → throwaway deploy → Phase 1 → verify → commit → and so
on. Review diffs, `/clear` between phases, and stop it if it drifts into the §11 non-goals
(especially a payment feature or a boolean `adopted` flag).
