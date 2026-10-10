import { solarMonitoring } from "@/lib/server/deviceMonitoring";
import { tenantJson, currentOrg } from "@/lib/server/context";
import { listUserAssets } from "@/lib/server/assetsStore";

export const dynamic = "force-dynamic";

/** The org's own registered Solar assets replace the demo set when present. */
export async function GET(req: Request) {
  return tenantJson(req, async () => {
    const mine = (await listUserAssets(currentOrg())).filter((a) => a.type === "Solar");
    return solarMonitoring(mine);
  });
}
