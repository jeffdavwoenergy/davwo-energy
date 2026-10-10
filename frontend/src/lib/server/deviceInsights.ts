// Alerts and ANI™ insights for the Solar, Battery and Fleet device types —
// derived from the same per-org simulations the dashboards show (and so from
// the org's own registered devices when it has them). EV-charger alerts and
// insights keep coming from the ANI engine in providers.ts.
//
// Alerts are built only from states that hold for at least an hour (faults,
// hourly inverter states, the vehicles' daily duty cycle), so they don't
// flicker in and out between refreshes; acknowledge/resolve state is stored
// by alert id like every other alert (alertState.ts).

import type { Alert } from "@/lib/server/simulator";
import { asTenant } from "@/lib/server/context";
import { listUserAssets } from "@/lib/server/assetsStore";
import { fleetMonitoring, solarMonitoring, batteryMonitoring } from "@/lib/server/deviceMonitoring";
import type {
  FleetMonitor, SolarMonitor, BatteryMonitor, FaultSeverity,
} from "@/lib/deviceMonitoringTypes";

export type DeviceKind = "ev" | "solar" | "battery" | "fleet";
export const DEVICE_KINDS: DeviceKind[] = ["ev", "solar", "battery", "fleet"];
export const DEVICE_ALERT_PREFIX = "dev:";

export interface DeviceMonitors {
  fleet: FleetMonitor;
  solar: SolarMonitor;
  battery: BatteryMonitor;
}

/** The org's three device simulations, built as that org (correct seed even
 * when the caller isn't inside a request context). */
export async function deviceMonitors(orgId: string): Promise<DeviceMonitors> {
  const assets = await listUserAssets(orgId);
  const of = (t: string) => assets.filter((a) => a.type === t);
  return asTenant(orgId, () => ({
    fleet: fleetMonitoring(of("Vehicle")),
    solar: solarMonitoring(of("Solar")),
    battery: batteryMonitoring(of("Battery")),
  }));
}

const SEVERITY: Record<FaultSeverity, Alert["severity"]> = { critical: "high", warning: "medium", info: "low" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hourStart = () => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();

export function fleetAlerts(m: FleetMonitor): Alert[] {
  const out: Alert[] = [];
  for (const v of m.vehicles) {
    const key = `${DEVICE_ALERT_PREFIX}fleet:${slug(v.assetId ?? v.id)}`;
    const href = `/dashboard?vehicle=${v.id}`;
    const label = `${v.name} · ${v.reg}`;
    for (const f of v.faults) {
      out.push({
        id: `${key}:${f.code.toLowerCase()}`, device: "fleet", severity: SEVERITY[f.severity], status: "active",
        title: `${f.title} (${f.code})`, asset: label, site: v.depot, created_at: f.firstSeen,
        detail: f.detail, action: f.action, href,
      });
    }
    if (v.status === "fault") continue; // already off the road — the fault says why
    if (v.status === "in_use" && v.socPct < 15) {
      out.push({
        id: `${key}:low-charge`, device: "fleet", severity: "high", status: "active",
        title: `Low charge on the road — ${v.socPct}%`, asset: label, site: v.depot, created_at: hourStart(),
        detail: `${v.rangeMiles} miles of range left before it's due back at ${v.returnTime}.`,
        action: "Send the driver to the nearest rapid charger, or bring the vehicle back early.", href,
      });
    }
    if (!v.readyByDeparture) {
      out.push({
        id: `${key}:not-ready`, device: "fleet", severity: "medium", status: "active",
        title: `Won't be ready for its ${v.scheduledDeparture} departure`, asset: label, site: v.depot, created_at: hourStart(),
        detail: `Projected ${v.socAtDeparturePct}% at departure; the run needs about ${v.neededSocPct}%.`,
        action: v.pluggedIn ? "Move it to a faster charger or swap the run to a vehicle with more charge." : "Plug it in at the depot now.",
        href,
      });
    }
    if (!v.pluggedIn && v.status !== "in_use" && v.socPct < 60) {
      out.push({
        id: `${key}:unplugged`, device: "fleet", severity: "low", status: "active",
        title: `Parked unplugged at ${v.socPct}%`, asset: label, site: v.depot, created_at: hourStart(),
        detail: `Back at ${v.depot} but not charging.`,
        action: "Ask the driver to plug in at the end of every shift.", href,
      });
    }
  }
  return out;
}

export function solarAlerts(m: SolarMonitor): Alert[] {
  const out: Alert[] = [];
  for (const inv of m.inverters) {
    const key = `${DEVICE_ALERT_PREFIX}solar:${slug(inv.name)}`;
    const fault = m.faults.find((f) => f.inverterId === inv.id);
    if (fault) {
      out.push({
        id: `${key}:${slug(fault.code)}`, device: "solar", severity: inv.status === "offline" ? "high" : "medium", status: "active",
        title: inv.status === "offline" ? `${inv.name} is offline` : `${inv.name} insulation warning`,
        asset: inv.name, site: inv.site, created_at: hourStart(), detail: `${fault.code}: ${fault.detail}.`,
        action: inv.status === "offline"
          ? "It should restart on its own; if it stays offline for an hour, call your installer."
          : "Book an installer to test the string wiring for damage or water ingress.",
        href: "/monitoring",
      });
    } else if (inv.performancePct < 90) {
      out.push({
        id: `${key}:underperforming`, device: "solar", severity: "low", status: "active",
        title: `${inv.name} producing ${100 - inv.performancePct}% below expected`,
        asset: inv.name, site: inv.site, created_at: hourStart(),
        detail: "Output is lower than the weather explains — usually dirty or shaded panels.",
        action: "Inspect the array and book a panel clean.", href: "/monitoring",
      });
    }
  }
  return out;
}

export function batteryAlerts(m: BatteryMonitor): Alert[] {
  const out: Alert[] = [];
  for (const u of m.units) {
    const key = `${DEVICE_ALERT_PREFIX}battery:${slug(u.name)}`;
    if (u.status === "warning") {
      out.push({
        id: `${key}:hot`, device: "battery", severity: "medium", status: "active",
        title: `${u.name} running hot — ${u.temperatureC}°C`, asset: u.name, site: u.site, created_at: hourStart(),
        detail: "Cell temperature is above the 40°C comfort limit, so charge and discharge power is being limited.",
        action: "Check the enclosure's ventilation and cooling fans.", href: "/monitoring",
      });
    }
    if (u.socPct <= m.backupReservePct + 3 && m.flow === "discharging") {
      out.push({
        id: `${key}:reserve`, device: "battery", severity: "low", status: "active",
        title: `${u.name} nearly down to its backup reserve`, asset: u.name, site: u.site, created_at: hourStart(),
        detail: `${u.socPct}% left; it stops discharging at ${m.backupReservePct}% to keep backup power.`,
        action: "No action needed unless you expect a power cut.", href: "/monitoring",
      });
    }
    if (u.healthPct < 88) {
      out.push({
        id: `${key}:health`, device: "battery", severity: "low", status: "active",
        title: `${u.name} capacity down to ${u.healthPct}%`, asset: u.name, site: u.site, created_at: hourStart(),
        detail: `After ${u.cycles} cycles it now stores ${u.healthPct}% of its original capacity.`,
        action: "Check the warranty threshold (often 70–80%) and plan a replacement budget.", href: "/monitoring",
      });
    }
  }
  return out;
}

/** All Solar/Battery/Fleet alerts for an org (EV alerts are added by the caller). */
export async function deviceAlerts(orgId: string): Promise<Alert[]> {
  const m = await deviceMonitors(orgId);
  return [...fleetAlerts(m.fleet), ...solarAlerts(m.solar), ...batteryAlerts(m.battery)];
}

// --------------------------------------------------------------- Insights ---

/** Same shape as the ANI engine's insights (src/lib/ani/engine.ts). */
export interface DeviceInsight {
  type:
    | "range_risk" | "charging_cost" | "maintenance" | "efficiency"
    | "underperformance" | "export" | "mode" | "health" | "reserve";
  severity: "high" | "medium" | "low" | "info";
  asset: string;
  metric: { name: string; value: number; window: string };
  recommendation: string;
  confidence: number;
  why: string;
}

const gbp = (n: number) => `£${n.toFixed(n >= 100 ? 0 : 2)}`;

export function fleetInsights(m: FleetMonitor, spreadPence: number): DeviceInsight[] {
  const out: DeviceInsight[] = [];
  const atRisk = m.vehicles.filter((v) => !v.readyByDeparture && v.status !== "fault");
  if (atRisk.length) {
    out.push({
      type: "range_risk", severity: atRisk.length > 1 ? "high" : "medium",
      asset: atRisk.map((v) => v.name).join(", "),
      metric: { name: "vehicles at risk", value: atRisk.length, window: "next departure" },
      recommendation: atRisk.some((v) => !v.pluggedIn)
        ? "Plug the unplugged vehicles in now — that alone gets most of them ready."
        : "Move these to faster chargers, or swap their runs to vehicles with more charge.",
      confidence: 0.86,
      why: atRisk.map((v) => `${v.name} (${v.reg}) is projected at ${v.socAtDeparturePct}% for its ${v.scheduledDeparture} run, which needs ~${v.neededSocPct}%`).join("; ") + ".",
    });
  }
  const nightlyKwh = m.vehicles.reduce((s, v) => s + (v.worksToday ? v.shiftUseKwh : 0), 0);
  if (nightlyKwh > 0) {
    // Moving from charge-on-arrival (early evening) to the cheapest overnight
    // hours typically captures about a third of the day's full price spread.
    const weekly = (nightlyKwh * 5 * spreadPence * 0.35) / 100;
    out.push({
      type: "charging_cost", severity: weekly > 20 ? "medium" : "low", asset: "Depot charging",
      metric: { name: "kWh charged per night", value: Math.round(nightlyKwh), window: "typical weekday" },
      recommendation: `Schedule depot charging into the cheapest overnight window — about ${gbp(weekly)} a week saved.`,
      confidence: 0.78,
      why: `The fleet puts back ~${Math.round(nightlyKwh)} kWh a night. Charging on arrival lands in the pricier early evening; today's prices span ${spreadPence.toFixed(1)}p/kWh, and every vehicle is parked long enough to charge in the cheap overnight window.`,
    });
  }
  const worn = m.vehicles.filter((v) => v.diagnostics.brakePadMm < 4 || v.diagnostics.auxBatteryV < 12.2);
  if (worn.length) {
    out.push({
      type: "maintenance", severity: "medium", asset: worn.map((v) => v.name).join(", "),
      metric: { name: "vehicles due maintenance", value: worn.length, window: "next 2 weeks" },
      recommendation: "Book these in together on a quiet day to keep them off the road for as little time as possible.",
      confidence: 0.8,
      why: worn.map((v) => (v.diagnostics.brakePadMm < 4 ? `${v.name}: brake pads at ${v.diagnostics.brakePadMm} mm` : `${v.name}: 12V battery at ${v.diagnostics.auxBatteryV} V`)).join("; ") + ".",
    });
  }
  // Least efficient vehicle vs others of the same type.
  for (const kind of new Set(m.vehicles.map((v) => v.kind))) {
    const same = m.vehicles.filter((v) => v.kind === kind);
    if (same.length < 2) continue;
    const avg = same.reduce((s, v) => s + v.milesPerKwh, 0) / same.length;
    const worst = same.reduce((a, b) => (b.milesPerKwh < a.milesPerKwh ? b : a));
    const gap = 1 - worst.milesPerKwh / avg;
    if (gap > 0.06) {
      out.push({
        type: "efficiency", severity: "low", asset: `${worst.name} · ${worst.reg}`,
        metric: { name: "mi/kWh", value: worst.milesPerKwh, window: "last 30 days" },
        recommendation: "Check its tyre pressures and payload, and review the route and driving style.",
        confidence: 0.7,
        why: `It manages ${worst.milesPerKwh} mi/kWh against ${avg.toFixed(2)} for the other ${kind}s — ${Math.round(gap * 100)}% worse.`,
      });
      break;
    }
  }
  return out;
}

export function solarInsights(m: SolarMonitor): DeviceInsight[] {
  const out: DeviceInsight[] = [];
  for (const inv of m.inverters.filter((i) => i.performancePct < 90 && i.status === "online")) {
    const lostKwhMonth = inv.capacityKwp * 3.2 * 30 * (1 - inv.performancePct / 100);
    out.push({
      type: "underperformance", severity: "medium", asset: `${inv.name} · ${inv.site}`,
      metric: { name: "output vs expected", value: inv.performancePct, window: "today" },
      recommendation: `Book a panel clean — worth about ${Math.round(lostKwhMonth)} kWh (${gbp(lostKwhMonth * 0.2)}) a month.`,
      confidence: 0.74,
      why: `It's producing ${inv.performancePct}% of what today's weather should give, while the other arrays are near 100% — the pattern of dirty or shaded panels rather than a fault.`,
    });
  }
  if (m.exportedPct > 40) {
    const monthKwh = (m.energyMonthKwh * m.exportedPct) / 100;
    out.push({
      type: "export", severity: "low", asset: "Export vs own use",
      metric: { name: "share exported", value: m.exportedPct, window: "today" },
      recommendation: `Run flexible loads (EV charging, heating, hot water) at midday, or store the surplus — about ${gbp(monthKwh * 0.4 * 0.13)} a month more value.`,
      confidence: 0.72,
      why: `You export ${m.exportedPct}% of what you generate at ~14p/kWh, then buy power back at ~27p. Using even 40% of that export yourself is worth more than selling it.`,
    });
  }
  return out;
}

export function batteryInsights(m: BatteryMonitor, spreadPence: number): DeviceInsight[] {
  const out: DeviceInsight[] = [];
  if (m.operatingMode !== "time-based" && spreadPence > 8) {
    const month = (m.usableCapacityKwh * 0.9 * spreadPence * 30) / 100;
    out.push({
      type: "mode", severity: "medium", asset: "Operating mode",
      metric: { name: "price spread", value: +spreadPence.toFixed(1), window: "today" },
      recommendation: `Switch to time-based mode — charge in the cheapest hours, discharge at the peak — about ${gbp(month)} a month.`,
      confidence: 0.76,
      why: `The battery is in ${m.operatingMode} mode, but today's prices vary by ${spreadPence.toFixed(1)}p/kWh. One full cheap-to-peak cycle a day of its ${m.usableCapacityKwh} kWh captures most of that.`,
    });
  }
  if (m.backupReservePct >= 30) {
    out.push({
      type: "reserve", severity: "low", asset: "Backup reserve",
      metric: { name: "reserve", value: m.backupReservePct, window: "setting" },
      recommendation: "Lower the reserve to 20% unless power cuts are common at this site.",
      confidence: 0.65,
      why: `${m.backupReservePct}% of the battery (${((m.totalCapacityKwh * m.backupReservePct) / 100).toFixed(1)} kWh) is held back every day and never earns savings.`,
    });
  }
  for (const u of m.units.filter((x) => x.status === "warning")) {
    out.push({
      type: "health", severity: "medium", asset: `${u.name} · ${u.site}`,
      metric: { name: "temperature °C", value: u.temperatureC, window: "now" },
      recommendation: "Improve the enclosure's ventilation — heat is the main cause of early capacity loss.",
      confidence: 0.7,
      why: `It's running at ${u.temperatureC}°C. Every 10°C above 25°C roughly doubles how fast lithium cells age.`,
    });
  }
  return out;
}

export async function deviceInsights(orgId: string, device: Exclude<DeviceKind, "ev">, spreadPence: number): Promise<DeviceInsight[]> {
  const m = await deviceMonitors(orgId);
  if (device === "fleet") return fleetInsights(m.fleet, spreadPence);
  if (device === "solar") return solarInsights(m.solar);
  return batteryInsights(m.battery, spreadPence);
}
