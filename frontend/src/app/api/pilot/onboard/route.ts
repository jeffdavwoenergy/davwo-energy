import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { buildWorkspace, savePilot, OBJECTIVES, type InfraProfile, type Objective } from "@/lib/server/pilot";

export const dynamic = "force-dynamic";

const VALID = new Set(OBJECTIVES.map((o) => o.id));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000) : 0;
};

export async function POST(req: Request) {
  if (!rateLimit(`pilot-onboard:${clientKey(req)}`, 15, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const organisation = (body?.organisation ?? "").toString().trim().slice(0, 120);
  if (!organisation) {
    return NextResponse.json({ detail: "Organisation name is required" }, { status: 400 });
  }
  const objectives = (Array.isArray(body?.objectives) ? body.objectives : [])
    .filter((o: unknown): o is Objective => typeof o === "string" && VALID.has(o as Objective))
    .slice(0, OBJECTIVES.length);

  const profile: InfraProfile = {
    organisation,
    sector: (body?.sector ?? "").toString().trim().slice(0, 80) || undefined,
    region: (body?.region ?? "").toString().trim().slice(0, 80) || undefined,
    evChargers: num(body?.evChargers),
    solarKw: num(body?.solarKw),
    batteryKwh: num(body?.batteryKwh),
    smartMeters: num(body?.smartMeters),
    objectives,
    challenges: (body?.challenges ?? "").toString().trim().slice(0, 1000) || undefined,
  };

  const workspace = await buildWorkspace(profile);
  // orgId from the token if signed in; the demo flow is reachable pre-auth too.
  const claims = await getAuth(req);
  const persisted = await savePilot(profile, workspace, claims?.org ?? "prospect");
  return NextResponse.json({ ...workspace, persisted }, { status: 201 });
}
