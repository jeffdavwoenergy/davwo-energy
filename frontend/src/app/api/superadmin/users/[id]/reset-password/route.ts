import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";
import { superAdminResetPassword, UserNotFoundError } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json({ tempPassword: await superAdminResetPassword(id) });
  } catch (err) {
    if (err instanceof UserNotFoundError) return NextResponse.json({ detail: err.message }, { status: 404 });
    throw err;
  }
}
