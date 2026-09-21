import { displayDay, parseDay } from "@/lib/dates";
import type { PublicStatus } from "@/lib/public";

/** One line explaining a status: "Adopted by X through Jun 1, 2028". */
export function StatusSummary({ status }: { status: PublicStatus }) {
  switch (status.kind) {
    case "AVAILABLE":
      return <span className="text-stone-500">Available to adopt</span>;
    case "ADOPTED":
      return (
        <span>
          <span className="font-medium">{status.adoption.displayName}</span>
          <span className="text-stone-500">
            {" "}
            · through {displayDay(parseDay(status.adoption.lastDay))}
          </span>
        </span>
      );
    case "RESERVED":
      return (
        <span>
          <span className="text-stone-500">Reserved from </span>
          {displayDay(parseDay(status.adoption.startDate))}
          <span className="text-stone-500"> by </span>
          <span className="font-medium">{status.adoption.displayName}</span>
        </span>
      );
  }
}
