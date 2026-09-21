import { prisma } from "@/lib/db";

// Always hit the database; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  try {
    const [benches, donors, adoptions] = await Promise.all([
      prisma.bench.count(),
      prisma.donor.count(),
      prisma.adoption.count(),
    ]);
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-green-800">OK — database reachable</h1>
        <p>
          {benches} benches · {donors} donors · {adoptions} adoptions
        </p>
      </div>
    );
  } catch (err) {
    console.error("health check failed", err);
    return <h1 className="text-xl font-semibold text-red-700">Database unreachable</h1>;
  }
}
