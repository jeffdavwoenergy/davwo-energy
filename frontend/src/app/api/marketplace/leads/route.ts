import { listLeadsForOrg } from "@/lib/server/marketplace";
import { tenantJson, currentOrg } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Enquiries the current org has sent — "my enquiries", so the enquiry flow
 * isn't a fire-and-forget dead end. */
export async function GET(req: Request) {
  return tenantJson(req, async () => ({ leads: await listLeadsForOrg(currentOrg()) }));
}
