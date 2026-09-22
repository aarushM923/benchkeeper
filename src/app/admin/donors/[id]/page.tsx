import Link from "next/link";
import { notFound } from "next/navigation";
import { AdoptionTable } from "@/components/admin/AdoptionTable";
import { listAdoptions } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The donor view ("benches I've adopted"), staff-only: without donor accounts,
 *  a public lookup-by-email would expose who adopted what. */
export default async function AdminDonorPage(props: PageProps<"/admin/donors/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const donor = await prisma.donor.findUnique({ where: { id } });
  if (!donor) notFound();
  const { adoptions } = await listAdoptions(prisma, { donorId: id }, today(), "all");
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm underline">← All adoptions</Link>
      <h1 className="text-2xl font-semibold">{donor.displayName}</h1>
      <p className="text-stone-600">{donor.email} · donor since {donor.createdAt.toISOString().slice(0, 10)}</p>
      <AdoptionTable adoptions={adoptions} />
    </div>
  );
}
