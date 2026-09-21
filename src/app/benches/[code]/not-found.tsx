import Link from "next/link";

export default function BenchNotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Bench not found</h1>
      <p className="text-stone-600">No active bench has that code.</p>
      <Link href="/benches" className="underline">
        Browse all benches
      </Link>
    </div>
  );
}
