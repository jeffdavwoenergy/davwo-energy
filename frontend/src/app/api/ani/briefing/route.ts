import { buildBriefing } from "@/lib/ani/briefing";
import { tenantJson } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return tenantJson(req, () => buildBriefing());
}
