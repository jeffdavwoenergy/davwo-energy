import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { disconnectIntegration, IntegrationInputError } from "@/lib/server/integrations/service";

export const dynamic = "force-dynamic";

/** Disconnect: deletes the stored credentials and every device (and reading)
 * the connection brought in. Admin only. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Only an admin can disconnect device platforms" }, { status: 403 });
  try {
    if (!(await disconnectIntegration(claims.org, id))) {
      return NextResponse.json({ detail: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IntegrationInputError) return NextResponse.json({ detail: err.message }, { status: err.status });
    throw err;
  }
}
