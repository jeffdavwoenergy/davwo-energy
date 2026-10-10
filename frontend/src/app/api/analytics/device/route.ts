import { NextResponse } from "next/server";
import { tenantJson, currentOrg } from "@/lib/server/context";
import { deviceMonitors } from "@/lib/server/deviceInsights";
import { fleetAnalytics, solarAnalytics, batteryAnalytics, PERIOD_DAYS, type AnalyticsPeriod } from "@/lib/server/deviceAnalytics";

export const dynamic = "force-dynamic";

/** GET ?device=solar|battery|fleet&period=week|month|quarter */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const device = sp.get("device");
  const period = (sp.get("period") ?? "month") as AnalyticsPeriod;
  if ((device !== "solar" && device !== "battery" && device !== "fleet") || !(period in PERIOD_DAYS)) {
    return NextResponse.json({ detail: "device must be solar, battery or fleet; period week, month or quarter" }, { status: 400 });
  }
  return tenantJson(req, async () => {
    const m = await deviceMonitors(currentOrg());
    if (device === "fleet") return fleetAnalytics(m.fleet, period);
    if (device === "solar") return solarAnalytics(m.solar, period);
    return batteryAnalytics(m.battery, period);
  });
}
