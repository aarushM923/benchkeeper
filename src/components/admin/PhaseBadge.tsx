import type { AdoptionPhase } from "@/lib/availability";

const STYLE: Record<AdoptionPhase, string> = {
  CURRENT: "bg-amber-100 text-amber-900",
  UPCOMING: "bg-sky-100 text-sky-900",
  ENDED: "bg-stone-200 text-stone-700",
  CANCELLED: "bg-red-100 text-red-800 line-through",
};

export function PhaseBadge({ phase }: { phase: AdoptionPhase }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[phase]}`}>
      {phase.charAt(0) + phase.slice(1).toLowerCase()}
    </span>
  );
}
