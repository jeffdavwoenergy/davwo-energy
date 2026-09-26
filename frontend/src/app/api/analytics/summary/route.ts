import { comparisonSummary } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const period = sp.get("period") || "week";
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  return tenantJson(req, () => comparisonSummary(period, { orgId: currentOrg(), from, to }));
}
