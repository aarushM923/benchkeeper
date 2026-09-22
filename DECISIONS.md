# DECISIONS.md

One line + reason each. Numbered 1–8 match SPEC.md §1; the rest came up while building.

## Confirmed from SPEC §1

1. **Adoptions are date ranges; bench status is derived, never stored.** A boolean `adopted`
   can't express expiry, a reservation that starts next month, or history — and it goes stale
   the day an adoption ends. There is no `adopted` or `status` column anywhere in the schema.
2. **Status is computed on read, relative to an `asOf` date (default: today).** Derived status
   can't go stale, needs no scheduled job, and the same function answers "free now?" and "was
   it free on X?". Statuses: `AVAILABLE`, `ADOPTED` (flagged `expiringSoon` within 60 days),
   `RESERVED` (free today, but a future adoption is booked).
3. **Lightweight `Donor` entity (displayName, email), matched by email.** One person can adopt
   several benches or renew; a repeat email updates the display name rather than creating a
   duplicate donor.
4. **Adoptions start today by default; duration is 1, 2, or 5 years.** Stored as a real
   `[start, end)` range, which paid off: advance reservations (Phase 3) needed no schema change.
   Server accepts any 1–120 months so the API isn't coupled to the form's options.
5. **Instant self-serve adoption, no approval step.** Matches the brief ("adopt a bench
   themselves").
6. **Public sees display name, dedication, and period; email is never public.** Enforced at the
   query (`donor: { select: { displayName } }`) *and* at a single projection function
   (`toPublicBench`) that every page and API route goes through — not by hiding it in the UI.
7. **Map was not MVP; list + search + filter + pagination is the core.** 500 benches are found
   faster by code/zone search than by panning. Because the seed already had approximate
   lat/lng, the map (Leaflet + OpenStreetMap, no API key) was a small Phase 3 add. Pins are
   synthetic points near each zone, and the page says so.
8. **Postgres for dev and prod (Neon in prod), via Prisma.** SQLite doesn't persist on Vercel's
   serverless filesystem, and one engine means no dev/prod provider swap.

## Made while building

9. **Ranges are half-open `[startDate, endDate)`.** An adoption ending 2028-06-01 and one starting
   2028-06-01 don't collide, so back-to-back renewals just work. `endDate` is the first day the
   bench is free again. **The UI shows "through `endDate − 1 day`"** so the inclusive-sounding
   copy is still true.
10. **Overlap is prevented twice: app check + Postgres exclusion constraint.** The app check
    (`rangesOverlap` inside a transaction) produces the friendly, specific error. The DB
    constraint (`EXCLUDE USING gist (bench WITH =, daterange(start,end,'[)') WITH &&) WHERE
    cancelled_at IS NULL`) is the guarantee: two simultaneous submissions can both pass the app
    check, but only one insert survives. Measured: across 10 rounds of 8 simultaneous
    submissions, 63 of 70 losers got past the app check and were stopped only by the database.
11. **Dates are calendar days (`DATE` columns), and "today" means today in New York.** A bench
    expiring Oct 1 should read available on Oct 1 *park time*, regardless of the server's UTC
    clock. In code, every day is a UTC-midnight `Date`; no local-timezone date library.
12. **Cancelling sets `cancelledAt` instead of deleting.** History stays auditable; cancelled
    rows are ignored by status derivation and by the exclusion constraint.
13. **Retired benches are soft-deleted (`active = false`) and hidden from public views.** Their
    adoption history survives.
14. **Status filtering happens in SQL, not after fetching everything.** The list filters and
    paginates in the database using where-clauses that mirror `getBenchStatus`; a test
    checks the two agree so the logic can't drift.
15. **Synthetic, deterministic seed (fixed PRNG seed 42), anchored to the day it runs.** No
    dataset was provided. The same run date gives identical data; anchoring to "today" keeps
    the demo showing a live mix instead of all-expired a year from now. Coordinates are
    approximate points near each zone, not survey data.
16. **Dedication: ≤ 140 chars, trimmed, no URLs.** A light guard sized for a plaque, not a
    moderation system (out of scope, SPEC §11).
17. **Admin is demo-grade: one shared password (`ADMIN_PASSWORD`), no staff accounts.** The
    session cookie is an expiry signed with HMAC-SHA256 keyed by that password (httpOnly,
    SameSite=Lax, 8 h), so changing the password logs everyone out; unset means admin is
    disabled, never defaulted. Every admin page, Server Action, and the CSV route checks auth
    itself, next to the data — a Server Action is a public POST endpoint whatever page renders
    it. Verified by replaying a captured "cancel" action without the cookie (refused) and with it
    (applied). Not built: per-user accounts, rate limiting beyond a delay, an audit log.
21. **Admins cancel, never delete; edits re-run the overlap rules.** Moving an end date goes
    through the same app check + exclusion constraint as adopting. Retiring a bench is refused
    while it has current or upcoming adoptions, so no donor silently loses a bench.
22. **No public "my benches" page — it's in admin instead.** Without donor accounts (a
    non-goal), a lookup by email would reveal who adopted what to anyone who knows an email.
23. **CSV export guards against formula injection.** Names and dedications are visitor-typed;
    a cell starting with `=`, `+`, `-`, or `@` is prefixed with `'` so it can't execute when staff
    open the file in Excel or Sheets.
18. **The adopt form is a Server Action with `useActionState`.** With JavaScript, errors show
    inline and typed values are kept; without it, the same form still submits (progressive
    enhancement). Everything is re-validated on the server, and the start date is always the
    server's "today" — the client never supplies dates.
19. **A repeat email updates the donor's display name everywhere.** One donor, one current
    name — the tradeoff is that renaming also changes the name shown on their older adoptions.
    Snapshotting the name per adoption is the alternative if plaques must never change.
20. **Stack pins: Next.js 16, Prisma 7.10 (stable).** npm's `latest` tag for `prisma` pointed at
    an 8.0 release candidate; I pinned the stable 7.x line that matches `@prisma/client`.
24. **Advance reservations: up to 365 days ahead, suggested from the "next open start".** The
    form defaults to the day after the bench's last booking ends — a start that can't conflict —
    which makes renewals back-to-back via the half-open ranges. Gaps between bookings are
    ignored for the suggestion; a visitor can still pick a date in one and the overlap check
    decides. The one-year cap keeps the calendar from filling years out.
