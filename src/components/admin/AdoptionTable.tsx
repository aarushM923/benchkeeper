import Link from "next/link";
import type { AdminAdoption } from "@/lib/admin";
import { formatDay, lastCoveredDay } from "@/lib/dates";
import { PhaseBadge } from "./PhaseBadge";

export function AdoptionTable({ adoptions }: { adoptions: AdminAdoption[] }) {
  if (adoptions.length === 0) {
    return <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-500">No adoptions match.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-stone-100 text-xs uppercase tracking-wide text-stone-600">
          <tr>
            <th className="px-3 py-2">Bench</th>
            <th className="px-3 py-2">Donor</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {adoptions.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="px-3 py-2">
                <Link href={`/admin/benches/${a.bench.code}`} className="font-mono font-semibold underline">
                  {a.bench.code}
                </Link>
                <div className="text-xs text-stone-500">{a.bench.zone}</div>
              </td>
              <td className="px-3 py-2">
                <Link href={`/admin/donors/${a.donor.id}`} className="underline">{a.donor.displayName}</Link>
              </td>
              <td className="px-3 py-2 text-stone-700">{a.donor.email}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {formatDay(a.startDate)} → {formatDay(lastCoveredDay(a.endDate))}
              </td>
              <td className="px-3 py-2"><PhaseBadge phase={a.phase} /></td>
              <td className="px-3 py-2">
                <Link href={`/admin/adoptions/${a.id}`} className="underline">Manage</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
