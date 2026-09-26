import { NextResponse } from "next/server";
import { withTenant, currentOrg, UnauthorizedError } from "@/lib/server/context";
import { updateAlertStatus } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const alert = await withTenant(req, () => updateAlertStatus(currentOrg(), id, "acknowledged"));
    return NextResponse.json(alert);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ detail: "Alert not found" }, { status: 404 });
  }
}
