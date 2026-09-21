// Public JSON API: GET /api/benches/:code?asOf=
// Returns the same public projection as the pages — never donor email.

import type { NextRequest } from "next/server";
import { getPublicBench } from "@/lib/benches";
import { formatDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { fromSearchParams, parseAsOf } from "@/lib/params";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/benches/[code]">) {
  const { code } = await ctx.params;
  const { asOf } = parseAsOf(fromSearchParams(req.nextUrl.searchParams));
  const bench = await getPublicBench(prisma, code, asOf);
  if (!bench) return Response.json({ error: "Bench not found" }, { status: 404 });
  return Response.json({ asOf: formatDay(asOf), bench });
}
