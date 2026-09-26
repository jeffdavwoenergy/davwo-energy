import { NextResponse } from "next/server";
import { smartWindow, checkAutoOptimise } from "@/lib/server/providers";
import { getAuth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// This endpoint also serves the pre-auth demo page, so it stays reachable
// without a token; the auto-optimise check is layered on only when one is
// present (best-effort — a failed check must never break the price/carbon
// data this endpoint exists to serve). A logged-in caller's own org (and
// therefore market) resolves the region; an anonymous demo-page hit falls
// back to the UK default, same as before.
export async function GET(req: Request) {
  const claims = await getAuth(req).catch(() => null);
  const result = await smartWindow(claims?.org);
  if (!claims) return NextResponse.json(result);

  const auto = await checkAutoOptimise(claims.org, claims.sub, result).catch(() => ({ autoScheduled: false }));
  return NextResponse.json({ ...result, auto_scheduled: auto.autoScheduled });
}
