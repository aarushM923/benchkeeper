import { BenchMap } from "@/components/BenchMap";
import { listBenchPins } from "@/lib/benches";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const LEGEND = [
  ["#15803d", "Available"],
  ["#d97706", "Adopted"],
  ["#0284c7", "Reserved"],
] as const;

export default async function MapPage() {
  const pins = await listBenchPins(prisma, today());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Map</h1>
        <p className="mt-1 text-stone-600">
          {pins.length} benches. Pin positions are approximate — placed near each area of the
          park, not surveyed. Click a pin for details.
        </p>
      </div>
      <ul className="flex flex-wrap gap-4 text-sm">
        {LEGEND.map(([color, label]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
      <BenchMap pins={pins} />
    </div>
  );
}
