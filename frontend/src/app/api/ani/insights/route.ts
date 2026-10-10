import { insights, priceCurve } from "@/lib/server/providers";
import { deviceInsights } from "@/lib/server/deviceInsights";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** ?device=solar|battery|fleet returns that device type's insights; anything
 * else (or none) keeps the ANI engine's EV-network insights. */
export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device");
  return tenantJson(req, async () => {
    if (device !== "solar" && device !== "battery" && device !== "fleet") return insights();
    const curve = await priceCurve(currentOrg());
    const spread = "spread_pence" in curve && curve.spread_pence != null ? curve.spread_pence : 12;
    return deviceInsights(currentOrg(), device, spread);
  });
}
