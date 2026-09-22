import Link from "next/link";
import { notFound } from "next/navigation";
import { AdoptForm } from "@/components/AdoptForm";
import { StatusSummary } from "@/components/StatusSummary";
import { MAX_LEAD_DAYS } from "@/lib/adopt";
import { getPublicBench } from "@/lib/benches";
import { daysBetween, displayDay, formatDay, parseDay, today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { adoptBench } from "./actions";

// Availability must be checked against today's data on every request.
export const dynamic = "force-dynamic";

export default async function AdoptPage(props: PageProps<"/benches/[code]/adopt">) {
  const { code } = await props.params;
  const now = today();
  const bench = await getPublicBench(prisma, decodeURIComponent(code), now);
  if (!bench) notFound();
  const openFrom = parseDay(bench.nextOpenStart);
  const bookable = daysBetween(now, openFrom) <= MAX_LEAD_DAYS;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href={`/benches/${bench.code}`} className="text-sm text-stone-600 underline">
        ← Back to {bench.code}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">
          Adopt bench <span className="font-mono">{bench.code}</span>
        </h1>
        <p className="text-stone-600">{bench.zone}</p>
      </div>

      {bench.status.kind !== "AVAILABLE" && (
        <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <p>
            <StatusSummary status={bench.status} />
          </p>
          {bookable && (
            <p className="text-sm">
              It&apos;s free from <strong>{displayDay(openFrom)}</strong> — you can reserve it
              starting then.
            </p>
          )}
        </div>
      )}

      {bookable ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <AdoptForm
            action={adoptBench.bind(null, bench.code)}
            today={formatDay(now)}
            suggestedStart={bench.nextOpenStart}
          />
        </div>
      ) : (
        // The server action re-checks anyway; this just avoids offering a form
        // that can't succeed.
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-6">
          <p className="text-lg">
            This bench is booked until {displayDay(openFrom)}. Reservations open up to a year ahead.
          </p>
          <Link href="/benches?status=AVAILABLE" className="inline-block underline">
            See available benches
          </Link>
        </div>
      )}
    </div>
  );
}
