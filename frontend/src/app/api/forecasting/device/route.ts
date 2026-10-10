import { NextResponse } from "next/server";
import { tenantJson, currentOrg } from "@/lib/server/context";
import { priceSlots } from "@/lib/server/providers";
import { deviceMonitors } from "@/lib/server/deviceInsights";
import { solarForecast, batteryForecast, fleetForecast } from "@/lib/server/deviceForecast";
import { fetchDailyWeather } from "@/lib/data/weather";
import { USE_REAL_DATA } from "@/lib/data/config";

export const dynamic = "force-dynamic";

/** Device sites are simulated around London (see deviceMonitoring.ts SITES),
 * so that's where the weather comes from. */
const WX = { lat: 51.505, lon: -0.15, tz: "Europe/London" };

/** GET ?device=solar|battery|fleet — that device type's forecast. */
export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device");
  if (device !== "solar" && device !== "battery" && device !== "fleet") {
    return NextResponse.json({ detail: "device must be solar, battery or fleet" }, { status: 400 });
  }
  return tenantJson(req, async () => {
    const org = currentOrg();
    const m = await deviceMonitors(org);
    // Best-effort live feeds — every forecast has a deterministic fallback.
    const weather = device !== "battery" && USE_REAL_DATA
      ? await fetchDailyWeather(WX.lat, WX.lon, WX.tz, 7).catch(() => null)
      : null;
    const prices = device !== "solar" ? await priceSlots(org).catch(() => null) : null;
    if (device === "solar") return solarForecast(m.solar, weather);
    if (device === "battery") return batteryForecast(m.battery, prices);
    return fleetForecast(m.fleet, weather, prices);
  });
}
