import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusSummary } from "@/components/StatusSummary";
import { listBenches, listZones, type BenchListQuery } from "@/lib/benches";
import { displayDay, formatDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseAsOf, parseListQuery } from "@/lib/params";

// Status depends on today's date and on adoptions made a second ago: never
// prerender or cache this page.
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  ["", "Any status"],
  ["AVAILABLE", "Available"],
  ["ADOPTED", "Adopted"],
  ["EXPIRING_SOON", "Adopted — expiring soon"],
  ["RESERVED", "Reserved"],
] as const;

function href(query: BenchListQuery, asOf: string | null, page: number) {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.zone) p.set("zone", query.zone);
  if (query.status) p.set("status", query.status);
  if (asOf) p.set("asOf", asOf);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/benches?${s}` : "/benches";
}

export default async function BenchesPage(props: PageProps<"/benches">) {
  const sp = await props.searchParams;
  const query = parseListQuery(sp);
  const { asOf, custom } = parseAsOf(sp);
  const asOfParam = custom ? formatDay(asOf) : null;

  const [{ benches, total, page, pageCount }, zones] = await Promise.all([
    listBenches(prisma, query, asOf),
    listZones(prisma),
  ]);

  const filtered = Boolean(query.q || query.zone || query.status || custom);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Benches</h1>
        <p className="mt-1 text-stone-600">
          Find a bench by its plaque code or park area, and see who has adopted it.
        </p>
      </div>

      {/* A plain GET form: filters live in the URL, so results are linkable and
          the page works without client-side JavaScript. */}
      <form
        action="/benches"
        className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_auto]"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Search</span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Code or area, e.g. PG-014 or Lake"
            className="rounded border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Area</span>
          <select
            name="zone"
            defaultValue={query.zone ?? ""}
            className="rounded border border-stone-300 px-2 py-1.5"
          >
            <option value="">All areas</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="rounded border border-stone-300 px-2 py-1.5"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">As of</span>
          <input
            type="date"
            name="asOf"
            defaultValue={formatDay(asOf)}
            className="rounded border border-stone-300 px-2 py-1.5"
          />
        </label>
        <div className="flex items-end gap-2">
          <button className="rounded bg-green-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-900">
            Apply
          </button>
          {filtered && (
            <Link href="/benches" className="py-1.5 text-sm text-stone-600 underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      {custom && (
        <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Showing status as of <strong>{displayDay(asOf)}</strong>, not today.
        </p>
      )}

      <p className="text-sm text-stone-600">
        {total} {total === 1 ? "bench" : "benches"}
        {pageCount > 1 && ` · page ${page} of ${pageCount}`}
      </p>

      {benches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-500">
          No benches match these filters.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
          {benches.map((b) => (
            <li key={b.code}>
              <Link
                href={`/benches/${b.code}${asOfParam ? `?asOf=${asOfParam}` : ""}`}
                className="grid gap-1 px-4 py-3 hover:bg-stone-50 sm:grid-cols-[6rem_14rem_1fr] sm:items-center sm:gap-4"
              >
                <span className="font-mono font-semibold">{b.code}</span>
                <span className="text-sm text-stone-600">{b.zone}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <StatusBadge status={b.status} />
                  <StatusSummary status={b.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(query, asOfParam, page - 1)} className="underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={href(query, asOfParam, page + 1)} className="underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
