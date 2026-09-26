import { faultSummary, checkAssetFaultAlerts } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return tenantJson(req, async () => {
    await checkAssetFaultAlerts(currentOrg()).catch(() => {});
    return faultSummary(currentOrg());
  });
}
