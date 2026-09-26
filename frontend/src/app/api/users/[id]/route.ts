import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import {
  updateUserRole,
  removeUser,
  DemoAccountActionError,
  SelfActionError,
  LastAdminError,
  UserNotFoundError,
} from "@/lib/server/users";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "operator", "pilot"];

function errorResponse(err: unknown) {
  if (err instanceof DemoAccountActionError || err instanceof SelfActionError || err instanceof LastAdminError) {
    return NextResponse.json({ detail: err.message }, { status: 403 });
  }
  if (err instanceof UserNotFoundError) {
    return NextResponse.json({ detail: err.message }, { status: 404 });
  }
  throw err;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const role: string = (body?.role ?? "").toString();
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ detail: "A valid role is required" }, { status: 400 });
  }

  try {
    const user = await updateUserRole(claims.org, claims.sub, id, role as Role);
    return NextResponse.json(user);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await removeUser(claims.org, claims.sub, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
