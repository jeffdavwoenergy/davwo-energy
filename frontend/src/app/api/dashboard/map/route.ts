import { mapPins } from "@/lib/server/providers";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return tenantJson(req, () => mapPins(currentOrg()));
}
