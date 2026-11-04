import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listAllActiveConnections } from "@/lib/server/integrations/connections";
import { ensureLiveData } from "@/lib/server/integrations/sync";
import { checkAssetFaultAlerts } from "@/lib/server/providers";
import { LIVE_TENANT_ID } from "@/lib/server/tenants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Scheduled sync (vercel.json — daily, the most a Vercel Hobby plan allows;
 * use "0 * * * *" on Pro for hourly) so device history and fault alerts keep
 * accruing even when nobody has the dashboard open — on-read sync covers the
 * rest. Same CRON_SECRET bearer check as /api/cron/reports.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ detail: "CRON_SECRET is not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const orgs = [...new Set([LIVE_TENANT_ID, ...(await listAllActiveConnections()).map((c) => c.orgId)])];
  const results = [];
  for (const orgId of orgs) {
    const snap = await ensureLiveData(orgId, { force: true });
    const alerts = await checkAssetFaultAlerts(orgId).catch(() => null);
    results.push({ orgId, devices: snap?.devices.length ?? 0, origin: snap?.origin ?? null, errors: snap?.errors ?? [], newFaults: alerts?.newFaults ?? 0 });
  }
  return NextResponse.json({ synced: results.length, results });
}
