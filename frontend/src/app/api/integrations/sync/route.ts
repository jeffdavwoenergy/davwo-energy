import { NextResponse } from "next/server";
import { withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { syncNow } from "@/lib/server/integrations/service";

export const dynamic = "force-dynamic";

/** Pull fresh data from every connected platform now, instead of waiting for
 * the 5-minute freshness window. Operators and admins. */
export async function POST(req: Request) {
  if (!rateLimit(`integrations-sync:${clientKey(req)}`, 12, 5 * 60_000)) {
    return NextResponse.json({ detail: "Syncing too often — please wait a minute." }, { status: 429 });
  }
  try {
    return NextResponse.json(await withMutateTenant(req, () => syncNow(currentOrg())));
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    throw err;
  }
}
