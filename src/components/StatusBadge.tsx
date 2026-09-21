import type { PublicStatus } from "@/lib/public";

const STYLES = {
  AVAILABLE: "bg-green-100 text-green-800 ring-green-600/20",
  ADOPTED: "bg-amber-100 text-amber-900 ring-amber-600/20",
  RESERVED: "bg-sky-100 text-sky-900 ring-sky-600/20",
} as const;

const LABELS = { AVAILABLE: "Available", ADOPTED: "Adopted", RESERVED: "Reserved" } as const;

export function StatusBadge({ status }: { status: PublicStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status.kind]}`}
      >
        {LABELS[status.kind]}
      </span>
      {status.kind === "ADOPTED" && status.expiringSoon && (
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-600/20">
          Expiring soon
        </span>
      )}
    </span>
  );
}
