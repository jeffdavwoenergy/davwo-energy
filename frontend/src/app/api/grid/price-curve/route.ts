import { NextResponse } from "next/server";
import { priceCurve } from "@/lib/server/providers";
import { getAuth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// Reachable without a token (same "public demo" shape as /grid/smart-window);
// a logged-in caller's own org resolves the region, anonymous stays UK.
export async function GET(req: Request) {
  const claims = await getAuth(req).catch(() => null);
  return NextResponse.json(await priceCurve(claims?.org));
}
