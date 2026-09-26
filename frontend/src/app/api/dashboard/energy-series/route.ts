import { energySeries } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const period = (new URL(req.url).searchParams.get("period") || "day") as "day" | "week" | "month";
  const valid = ["day", "week", "month"].includes(period) ? period : "day";
  return tenantJson(req, async () => ({ period: valid, points: await energySeries(currentOrg(), valid) }));
}
