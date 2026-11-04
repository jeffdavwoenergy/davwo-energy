import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";
import { superAdminSetRole, superAdminRemoveUser, LastAdminError, UserNotFoundError } from "@/lib/server/users";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "operator", "pilot"];

function errorResponse(err: unknown) {
  if (err instanceof LastAdminError) return NextResponse.json({ detail: err.message }, { status: 409 });
  if (err instanceof UserNotFoundError) return NextResponse.json({ detail: err.message }, { status: 404 });
  throw err;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const role: string = (body?.role ?? "").toString();
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ detail: "A valid role is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await superAdminSetRole(id, role as Role));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await superAdminRemoveUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
