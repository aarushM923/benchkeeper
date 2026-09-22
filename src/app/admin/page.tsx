import Link from "next/link";
import { AdoptionTable } from "@/components/admin/AdoptionTable";
import { isPhase, listAdoptions, PHASES, type AdoptionQuery } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAdoptionsPage(props: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const query: AdoptionQuery = {
    q: one(sp.q)?.slice(0, 100) || undefined,
    phase: isPhase(one(sp.phase)) ? (one(sp.phase) as AdoptionQuery["phase"]) : undefined,
  };
  const page = Number.parseInt(one(sp.page) ?? "1", 10) || 1;
  const { adoptions, total, page: p, pageCount } = await listAdoptions(prisma, query, today(), page);

  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (query.q) u.set("q", query.q);
    if (query.phase) u.set("phase", query.phase);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return u.toString();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Adoptions</h1>
        <a href={`/admin/export?${qs({})}`} className="text-sm underline">
          Export these as CSV
        </a>
      </div>
      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Search</span>
          <input name="q" defaultValue={query.q} placeholder="Bench code, donor name or email" className="w-72 rounded border border-stone-300 px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Status</span>
          <select name="phase" defaultValue={query.phase ?? ""} className="rounded border border-stone-300 px-2 py-1.5">
            <option value="">All</option>
            {PHASES.map((ph) => (
              <option key={ph} value={ph}>{ph.charAt(0) + ph.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
        <button className="rounded bg-green-800 px-4 py-1.5 font-medium text-white">Apply</button>
      </form>
      <p className="text-sm text-stone-600">{total} adoptions{pageCount > 1 && ` · page ${p} of ${pageCount}`}</p>
      <AdoptionTable adoptions={adoptions} />
      {pageCount > 1 && (
        <nav className="flex justify-between text-sm">
          {p > 1 ? <Link className="underline" href={`/admin?${qs({ page: String(p - 1) })}`}>← Previous</Link> : <span />}
          {p < pageCount ? <Link className="underline" href={`/admin?${qs({ page: String(p + 1) })}`}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
