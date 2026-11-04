import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";
import { buildOverview } from "@/lib/server/superadmin";

export const dynamic = "force-dynamic";

/** One payload for the whole console — every page filters it client-side. */
export async function GET(req: Request) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await buildOverview());
}
