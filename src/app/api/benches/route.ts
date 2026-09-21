// Public JSON API: GET /api/benches?q=&zone=&status=&page=&asOf=
// Returns the same public projection as the pages — never donor email.

import type { NextRequest } from "next/server";
import { listBenches } from "@/lib/benches";
import { formatDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { fromSearchParams, parseAsOf, parseListQuery } from "@/lib/params";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = fromSearchParams(req.nextUrl.searchParams);
  const { asOf } = parseAsOf(sp);
  const result = await listBenches(prisma, parseListQuery(sp), asOf);
  return Response.json({ asOf: formatDay(asOf), ...result });
}
