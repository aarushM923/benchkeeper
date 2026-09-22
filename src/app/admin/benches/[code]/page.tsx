import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdoptionTable } from "@/components/admin/AdoptionTable";
import { BenchFields } from "@/components/admin/BenchFields";
import { listAdoptions } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { listZones } from "@/lib/benches";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { setBenchActiveAction, updateBenchAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminBenchPage(props: PageProps<"/admin/benches/[code]">) {
  await requireAdmin();
  const code = decodeURIComponent((await props.params).code);
  const bench = await prisma.bench.findUnique({ where: { code } });
  if (!bench) notFound();
  const [zones, { adoptions }] = await Promise.all([
    listZones(prisma),
    listAdoptions(prisma, { benchCode: code }, today(), "all"),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/admin/benches" className="text-sm underline">← All benches</Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-2xl font-semibold">{bench.code}</h1>
        {bench.active ? (
          <Link href={`/benches/${bench.code}`} className="text-sm underline">Public page</Link>
        ) : (
          <span className="rounded bg-stone-200 px-2 py-0.5 text-xs">Retired — hidden from the public</span>
        )}
      </div>

      <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Details</h2>
        <AdminForm action={updateBenchAction.bind(null, bench.code)} submitLabel="Save">
          <BenchFields zones={zones} bench={bench} />
        </AdminForm>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Adoption history</h2>
        <AdoptionTable adoptions={adoptions} />
      </section>

      <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">{bench.active ? "Retire bench" : "Restore bench"}</h2>
        <p className="text-sm text-stone-600">
          {bench.active
            ? "Retiring hides the bench from the public but keeps its history. Benches with current or upcoming adoptions can't be retired."
            : "Restoring makes the bench visible and adoptable again."}
        </p>
        <AdminForm
          action={setBenchActiveAction.bind(null, bench.code, !bench.active)}
          submitLabel={bench.active ? "Retire" : "Restore"}
          danger={bench.active}
          confirm={bench.active ? `Retire ${bench.code}?` : undefined}
        />
      </section>
    </div>
  );
}
