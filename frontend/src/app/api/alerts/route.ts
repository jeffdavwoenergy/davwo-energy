import { alertsWithState, checkAssetFaultAlerts } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const severity = sp.get("severity");
  const status = sp.get("status");
  return tenantJson(req, async () => {
    // Best-effort — a missed proactive-alert email must never block the page
    // the user is actively trying to load.
    await checkAssetFaultAlerts(currentOrg()).catch(() => {});
    let list = await alertsWithState(currentOrg());
    if (severity) list = list.filter((a) => a.severity === severity);
    if (status) list = list.filter((a) => a.status === status);
    return list;
  });
}
