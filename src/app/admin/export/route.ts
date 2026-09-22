// CSV export of adoptions for staff (includes donor email). Same filters as
// the admin adoptions table.

import type { NextRequest } from "next/server";
import { adoptionsToCsv, isPhase, listAdoptions } from "@/lib/admin";
import { isAdmin } from "@/lib/auth";
import { formatDay, today } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Route handlers return 401 rather than redirecting to the login page.
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const phase = sp.get("phase");
  const asOf = today();
  const { adoptions } = await listAdoptions(
    prisma,
    { q: sp.get("q")?.slice(0, 100) || undefined, phase: isPhase(phase) ? phase : undefined },
    asOf,
    "all",
  );
  return new Response(adoptionsToCsv(adoptions), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adoptions-${formatDay(asOf)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
