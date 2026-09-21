import { prisma } from "@/lib/db";

// Always hit the database; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

async function countRows() {
  try {
    const [benches, donors, adoptions] = await Promise.all([
      prisma.bench.count(),
      prisma.donor.count(),
      prisma.adoption.count(),
    ]);
    return { benches, donors, adoptions };
  } catch (err) {
    console.error("health check failed", err);
    return null;
  }
}

export default async function HealthPage() {
  const counts = await countRows();
  if (!counts) {
    return <h1 className="text-xl font-semibold text-red-700">Database unreachable</h1>;
  }
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-green-800">OK — database reachable</h1>
      <p>
        {counts.benches} benches · {counts.donors} donors · {counts.adoptions} adoptions
      </p>
    </div>
  );
}
