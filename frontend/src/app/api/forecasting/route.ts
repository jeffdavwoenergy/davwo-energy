import { forecastPayload } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const horizon = new URL(req.url).searchParams.get("horizon") || "14d";
  return tenantJson(req, () => forecastPayload(horizon, currentOrg()));
}
