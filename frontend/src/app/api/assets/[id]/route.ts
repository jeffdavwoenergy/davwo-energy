import { NextResponse } from "next/server";
import { getAsset, updateAsset, deleteAsset } from "@/lib/server/providers";
import { withTenant, withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import type { AssetStatus } from "@/lib/server/assetsStore";

export const dynamic = "force-dynamic";

const STATUSES: AssetStatus[] = ["healthy", "degraded", "down"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const asset = await withTenant(req, () => getAsset(currentOrg(), id));
    if (!asset) return NextResponse.json({ detail: "Asset not found" }, { status: 404 });
    return NextResponse.json(asset);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

/** Only ever succeeds for a user-registered asset in the caller's own org —
 * engine/preview assets never exist in the DB-backed store, so an attempt to
 * edit one 404s here instead of silently no-op'ing. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const status: string | undefined = body?.status;
  if (status !== undefined && !STATUSES.includes(status as AssetStatus)) {
    return NextResponse.json({ detail: "status must be healthy, degraded or down" }, { status: 400 });
  }
  const installed_at: string | undefined = body?.installed_at;
  if (installed_at !== undefined && installed_at !== "" && Number.isNaN(new Date(installed_at).getTime())) {
    return NextResponse.json({ detail: "installed_at must be a valid date" }, { status: 400 });
  }

  try {
    const asset = await withMutateTenant(req, () =>
      updateAsset(currentOrg(), id, {
        status: status as AssetStatus | undefined,
        manufacturer: body?.manufacturer,
        model: body?.model,
        serial_number: body?.serial_number,
        installed_at,
        product_id: body?.product_id,
      }),
    );
    if (!asset) return NextResponse.json({ detail: "Asset not found" }, { status: 404 });
    return NextResponse.json(asset);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const removed = await withMutateTenant(req, () => deleteAsset(currentOrg(), id));
    if (!removed) return NextResponse.json({ detail: "Asset not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}
