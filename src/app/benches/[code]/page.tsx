import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { getPublicBench } from "@/lib/benches";
import { MAX_LEAD_DAYS } from "@/lib/adopt";
import { daysBetween, displayDay, parseDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseAsOf } from "@/lib/params";
import type { PublicAdoption } from "@/lib/public";

// Status depends on today and on the latest adoptions: never cache.
export const dynamic = "force-dynamic";

function Period({ a }: { a: PublicAdoption }) {
  return (
    <>
      {displayDay(parseDay(a.startDate))} – {displayDay(parseDay(a.lastDay))}
    </>
  );
}

function AdoptionCard({ a, title }: { a: PublicAdoption; title: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium uppercase tracking-wide text-stone-500">{title}</p>
      <p className="text-xl font-semibold">{a.displayName}</p>
      {a.dedication && (
        <blockquote className="border-l-4 border-green-700 pl-3 italic text-stone-700">
          “{a.dedication}”
        </blockquote>
      )}
      <p className="text-sm text-stone-600">
        <Period a={a} />
      </p>
    </div>
  );
}

export default async function BenchPage(props: PageProps<"/benches/[code]">) {
  const [{ code }, sp] = await Promise.all([props.params, props.searchParams]);
  const { asOf, custom } = parseAsOf(sp);
  const bench = await getPublicBench(prisma, decodeURIComponent(code), asOf);
  if (!bench) notFound();

  const { status } = bench;
  const adopted = sp.adopted === "1";
  const reserved = sp.reserved === "1";
  const openFrom = parseDay(bench.nextOpenStart);
  const canReserve =
    !custom && status.kind !== "AVAILABLE" && daysBetween(asOf, openFrom) <= MAX_LEAD_DAYS;

  return (
    <div className="space-y-6">
      <Link href="/benches" className="text-sm text-stone-600 underline">
        ← All benches
      </Link>

      {adopted && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900">
          Thank you! Bench {bench.code} is now adopted.
        </p>
      )}
      {reserved && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900">
          Thank you! Your reservation of bench {bench.code} is booked.
        </p>
      )}
      {custom && (
        <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Showing status as of <strong>{displayDay(asOf)}</strong>, not today.{" "}
          <Link href={`/benches/${bench.code}`} className="underline">
            Show today
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-3xl font-semibold">{bench.code}</h1>
        <StatusBadge status={status} />
      </div>
      <p className="text-stone-600">
        {bench.zone}
        {bench.material && ` · ${bench.material}`}
        {bench.installedYear && ` · installed ${bench.installedYear}`}
      </p>

      <section className="rounded-lg border border-stone-200 bg-white p-6">
        {status.kind === "ADOPTED" && (
          <>
            <AdoptionCard a={status.adoption} title="Adopted by" />
            {status.expiringSoon && (
              <p className="mt-4 text-sm text-orange-800">
                This adoption ends soon
                {bench.nextOpenStart === status.adoption.endDate
                  ? ` — the bench becomes available on ${displayDay(parseDay(status.adoption.endDate))}.`
                  : ", but the bench is already reserved after that."}
              </p>
            )}
          </>
        )}

        {status.kind === "RESERVED" && (
          <>
            <p className="mb-4 text-stone-700">
              This bench is free right now, but an adoption has already been booked to
              start on {displayDay(parseDay(status.adoption.startDate))}.
            </p>
            <AdoptionCard a={status.adoption} title="Reserved by" />
          </>
        )}

        {status.kind === "AVAILABLE" && (
          <div className="space-y-4">
            <p className="text-lg">
              This bench is <strong>available</strong>
              {custom ? ` on ${displayDay(asOf)}` : ""}.
            </p>
            {!custom && (
              <Link
                href={`/benches/${bench.code}/adopt`}
                className="inline-block rounded bg-green-800 px-5 py-2.5 font-medium text-white hover:bg-green-900"
              >
                Adopt this bench
              </Link>
            )}
          </div>
        )}
      </section>

      {canReserve && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-stone-700">
            Want this bench next? It&apos;s free from <strong>{displayDay(openFrom)}</strong>.
          </p>
          <Link
            href={`/benches/${bench.code}/adopt`}
            className="rounded border border-green-800 px-4 py-2 text-sm font-medium text-green-900 hover:bg-green-50"
          >
            Reserve from {displayDay(openFrom)}
          </Link>
        </div>
      )}

      {bench.upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Coming up</h2>
          <ul className="space-y-1 text-sm">
            {bench.upcoming.map((a) => (
              <li key={a.startDate}>
                <span className="font-medium">{a.displayName}</span>
                <span className="text-stone-600">
                  {" "}
                  · <Period a={a} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
