import Link from "next/link";
import { AdminForm } from "@/components/admin/AdminForm";
import { BenchFields } from "@/components/admin/BenchFields";
import { requireAdmin } from "@/lib/auth";
import { listZones } from "@/lib/benches";
import { prisma } from "@/lib/db";
import { createBenchAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminBenchesPage(props: PageProps<"/admin/benches">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 100) || "";
  const showRetired = sp.retired === "1";

  const [benches, zones] = await Promise.all([
    prisma.bench.findMany({
      where: {
        ...(showRetired ? {} : { active: true }),
        ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { zone: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { code: true, zone: true, active: true, _count: { select: { adoptions: true } } },
      orderBy: { code: "asc" },
      take: 100,
    }),
    listZones(prisma),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Benches</h1>
      <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Add a bench</h2>
        <AdminForm action={createBenchAction} submitLabel="Add bench">
          <BenchFields zones={zones} />
        </AdminForm>
      </section>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <input name="q" defaultValue={q} placeholder="Code or zone" className="w-60 rounded border border-stone-300 px-2 py-1.5" />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="retired" value="1" defaultChecked={showRetired} /> Include retired
        </label>
        <button className="rounded bg-green-800 px-4 py-1.5 font-medium text-white">Search</button>
      </form>
      <p className="text-sm text-stone-600">Showing up to 100 — search to narrow down.</p>
      <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white text-sm">
        {benches.map((b) => (
          <li key={b.code} className="flex items-center gap-4 px-3 py-2">
            <Link href={`/admin/benches/${b.code}`} className="w-20 font-mono font-semibold underline">{b.code}</Link>
            <span className="flex-1 text-stone-600">{b.zone}</span>
            <span className="text-stone-500">{b._count.adoptions} adoptions</span>
            {!b.active && <span className="rounded bg-stone-200 px-2 py-0.5 text-xs">Retired</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
