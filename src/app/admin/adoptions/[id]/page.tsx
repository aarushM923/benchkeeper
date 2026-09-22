import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminForm } from "@/components/admin/AdminForm";
import { PhaseBadge } from "@/components/admin/PhaseBadge";
import { getAdoption } from "@/lib/admin";
import { DEDICATION_MAX } from "@/lib/adopt";
import { requireAdmin } from "@/lib/auth";
import { displayDay, formatDay, lastCoveredDay, today } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { cancelAdoptionAction, editAdoption } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminAdoptionPage(props: PageProps<"/admin/adoptions/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const a = await getAdoption(prisma, id, today());
  if (!a) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin" className="text-sm underline">← All adoptions</Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">
          <span className="font-mono">{a.bench.code}</span> · {a.donor.displayName}
        </h1>
        <PhaseBadge phase={a.phase} />
      </div>
      <dl className="grid grid-cols-[9rem_1fr] gap-y-1 rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <dt className="text-stone-500">Donor email</dt><dd>{a.donor.email}</dd>
        <dt className="text-stone-500">Period</dt>
        <dd>{displayDay(a.startDate)} – {displayDay(lastCoveredDay(a.endDate))} <span className="text-stone-500">(free again {displayDay(a.endDate)})</span></dd>
        <dt className="text-stone-500">Created</dt><dd>{a.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
        {a.cancelledAt && (<><dt className="text-stone-500">Cancelled</dt><dd>{a.cancelledAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd></>)}
      </dl>

      {a.phase !== "CANCELLED" && (
        <>
          <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="font-semibold">Edit</h2>
            <AdminForm action={editAdoption.bind(null, a.id)} submitLabel="Save changes">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">First free day (exclusive end date)</span>
                <input type="date" name="endDate" defaultValue={formatDay(a.endDate)} className="rounded border border-stone-300 px-2 py-1.5" />
                <span className="block text-xs text-stone-500">Extending re-checks for overlaps with the bench&apos;s other adoptions.</span>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Dedication</span>
                <textarea name="dedication" rows={2} maxLength={DEDICATION_MAX} defaultValue={a.dedication ?? ""} className="w-full rounded border border-stone-300 px-2 py-1.5" />
              </label>
            </AdminForm>
          </section>
          <section className="space-y-2 rounded-lg border border-red-200 bg-white p-4">
            <h2 className="font-semibold text-red-800">Cancel adoption</h2>
            <p className="text-sm text-stone-600">
              The record is kept for history, but the bench stops showing as adopted immediately.
            </p>
            <AdminForm
              action={cancelAdoptionAction.bind(null, a.id)}
              submitLabel="Cancel this adoption"
              danger
              confirm={`Cancel ${a.donor.displayName}'s adoption of ${a.bench.code}?`}
            />
          </section>
        </>
      )}
    </div>
  );
}
