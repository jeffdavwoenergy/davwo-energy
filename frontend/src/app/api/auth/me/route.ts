import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { findById, publicUser, updateProfile } from "@/lib/server/users";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const user = await findById(claims.sub);
  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });
  // claims.org reflects the (possibly switched) active org.
  return NextResponse.json(await publicUser(user, claims.org));
}

export async function PATCH(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`profile-update:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: { name?: string; company?: string; job_title?: string } = {};
  if (body?.name !== undefined) updates.name = body.name.toString().trim().slice(0, 120);
  if (body?.company !== undefined) updates.company = body.company.toString().trim().slice(0, 120);
  if (body?.job_title !== undefined) updates.job_title = body.job_title.toString().trim().slice(0, 120);

  if (updates.name !== undefined && !updates.name) {
    return NextResponse.json({ detail: "Name cannot be empty" }, { status: 400 });
  }

  const user = await updateProfile(claims.sub, updates);
  return NextResponse.json(user);
}
