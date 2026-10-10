import { describe, it, expect, vi } from "vitest";

// Live price feed stubbed — the insights route reads today's price spread.
vi.mock("@/lib/data/regions/uk", () => ({
  fetchCarbonIntensity: vi.fn(async () => null),
  fetchCarbonForecast: vi.fn(async () => null),
  fetchOctopusAgile: vi.fn(async () => null),
  fetchOctopusWindow: vi.fn(async () => [
    { valid_from: "2026-10-10T01:00:00Z", pence: 9 },
    { valid_from: "2026-10-10T17:00:00Z", pence: 39 },
  ]),
  fetchWeather: vi.fn(async () => null),
  fetchChargePoints: vi.fn(async () => null),
  GRID_BASELINE_GCO2: 233,
}));

import { asTenant } from "@/lib/server/context";
import { fleetMonitoring, solarMonitoring, batteryMonitoring } from "@/lib/server/deviceMonitoring";
import {
  deviceMonitors, fleetAlerts, solarAlerts, batteryAlerts, deviceAlerts,
  fleetInsights, solarInsights, batteryInsights, deviceInsights, DEVICE_ALERT_PREFIX,
} from "@/lib/server/deviceInsights";
import { alertsWithState, updateAlertStatus, notifications } from "@/lib/server/providers";
import { GET as alertsRoute } from "@/app/api/alerts/route";
import { POST as acknowledge } from "@/app/api/alerts/[id]/acknowledge/route";
import { GET as insightsRoute } from "@/app/api/ani/insights/route";
import { signToken } from "@/lib/server/jwt";
import type { FleetMonitor, FleetVehicle, SolarMonitor, BatteryMonitor } from "@/lib/deviceMonitoringTypes";

const newOrg = () => `org-ins-${Math.random().toString(36).slice(2)}`;
const fleetOf = async () => asTenant(newOrg(), () => fleetMonitoring());

function vehicle(base: FleetVehicle, over: Partial<FleetVehicle>): FleetVehicle {
  return { ...base, faults: [], ...over, diagnostics: { ...base.diagnostics, brakePadMm: 8, auxBatteryV: 12.6, ...(over.diagnostics ?? {}) } };
}

describe("fleet alerts", () => {
  it("raises fault, low-charge, not-ready and unplugged alerts with stable prefixed ids", async () => {
    const m = await fleetOf();
    const b = m.vehicles[0];
    const fault = { code: "P0AA6", title: "High-voltage isolation fault", component: "battery" as const, severity: "critical" as const, detail: "d".repeat(20), action: "a".repeat(20), firstSeen: new Date().toISOString() };
    const fm: FleetMonitor = {
      ...m,
      vehicles: [
        vehicle(b, { id: "VH-1", status: "fault", readyByDeparture: false, faults: [fault] }),
        vehicle(b, { id: "VH-2", status: "in_use", socPct: 10, readyByDeparture: true, pluggedIn: false }),
        vehicle(b, { id: "VH-3", status: "charging", socPct: 50, readyByDeparture: false, pluggedIn: true }),
        vehicle(b, { id: "VH-4", status: "idle", socPct: 40, readyByDeparture: false, pluggedIn: false }),
        vehicle(b, { id: "VH-5", status: "ready", socPct: 95, readyByDeparture: true, pluggedIn: true }),
      ],
    };
    const alerts = fleetAlerts(fm);
    const ids = alerts.map((a) => a.id);
    expect(ids).toEqual([
      `${DEVICE_ALERT_PREFIX}fleet:vh-1:p0aa6`,
      `${DEVICE_ALERT_PREFIX}fleet:vh-2:low-charge`,
      `${DEVICE_ALERT_PREFIX}fleet:vh-3:not-ready`,
      `${DEVICE_ALERT_PREFIX}fleet:vh-4:not-ready`,
      `${DEVICE_ALERT_PREFIX}fleet:vh-4:unplugged`,
    ]);
    expect(alerts[0]).toMatchObject({ device: "fleet", severity: "high", href: "/dashboard?vehicle=VH-1" });
    expect(alerts[2].action).toMatch(/faster charger/);
    expect(alerts[3].action).toMatch(/Plug it in/);
  });
});

describe("solar and battery alerts", () => {
  it("solar: offline, insulation warning and underperforming arrays", async () => {
    const m = await asTenant(newOrg(), () => solarMonitoring());
    const inv = m.inverters[0];
    const sm: SolarMonitor = {
      ...m,
      inverters: [
        { ...inv, id: "A", name: "Roof A", status: "offline", performancePct: 0 },
        { ...inv, id: "B", name: "Roof B", status: "warning", performancePct: 95 },
        { ...inv, id: "C", name: "Roof C", status: "online", performancePct: 82 },
        { ...inv, id: "D", name: "Roof D", status: "online", performancePct: 99 },
      ],
      faults: [
        { inverterId: "A", name: "Roof A", code: "GridMonitoring", detail: "trip", at: new Date().toISOString() },
        { inverterId: "B", name: "Roof B", code: "DcIsoLow", detail: "iso", at: new Date().toISOString() },
      ],
    };
    const a = solarAlerts(sm);
    expect(a.map((x) => [x.title, x.severity])).toEqual([
      ["Roof A is offline", "high"],
      ["Roof B insulation warning", "medium"],
      ["Roof C producing 18% below expected", "low"],
    ]);
  });

  it("battery: hot unit, near reserve while discharging, and capacity fade", async () => {
    const m = await asTenant(newOrg(), () => batteryMonitoring());
    const u = m.units[0];
    const bm: BatteryMonitor = {
      ...m, flow: "discharging", backupReservePct: 20,
      units: [
        { ...u, name: "Hot", status: "warning", temperatureC: 44, socPct: 80, healthPct: 95 },
        { ...u, name: "Low", status: "online", socPct: 22, healthPct: 95 },
        { ...u, name: "Old", status: "online", socPct: 80, healthPct: 84 },
      ],
    };
    expect(batteryAlerts(bm).map((a) => a.id)).toEqual([
      `${DEVICE_ALERT_PREFIX}battery:hot:hot`,
      `${DEVICE_ALERT_PREFIX}battery:low:reserve`,
      `${DEVICE_ALERT_PREFIX}battery:old:health`,
    ]);
  });
});

describe("device alerts in the alert feed", () => {
  it("are listed with their device, filterable, acknowledgeable, and counted in notifications", async () => {
    const org = newOrg();
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org });
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const own = await deviceAlerts(org);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((a) => a.id.startsWith(DEVICE_ALERT_PREFIX))).toBe(true);

    const all = await alertsWithState(org);
    expect(all.find((a) => a.id === "al-1")?.device).toBe("ev");
    expect(all.find((a) => a.id === "al-3")?.device).toBe("battery");

    const fleetOnly = await (await alertsRoute(new Request("http://x/api/alerts?device=fleet", auth))).json();
    expect(fleetOnly.every((a: { device: string }) => a.device === "fleet")).toBe(true);
    const evOnly = await (await alertsRoute(new Request("http://x/api/alerts?device=ev", auth))).json();
    expect(evOnly.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(["al-1", "al-2", "al-4"]));

    const target = own[0];
    const res = await acknowledge(new Request("http://x", { method: "POST", ...auth }), { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("acknowledged");
    expect((await alertsWithState(org)).find((a) => a.id === target.id)?.status).toBe("acknowledged");

    await expect(updateAlertStatus(org, `${DEVICE_ALERT_PREFIX}fleet:nope:x`, "resolved")).rejects.toThrow("Alert not found");
    const n = await notifications(org);
    expect(n.items.some((i) => i.id.startsWith(DEVICE_ALERT_PREFIX))).toBe(true);
  });

  it("deviceMonitors builds each org's own simulation", async () => {
    const [a, b] = await Promise.all([deviceMonitors("davwo"), deviceMonitors("acme")]);
    expect(a.fleet.vehicles.map((v) => v.reg)).not.toEqual(b.fleet.vehicles.map((v) => v.reg));
    expect(a.solar.source).toBe("demo");
  });
});

describe("device insights", () => {
  it("fleet: readiness risk, smart-charging saving, maintenance and the least efficient vehicle", async () => {
    const m = await fleetOf();
    const b = { ...m.vehicles[0], kind: "van" as const };
    const fm: FleetMonitor = {
      ...m,
      vehicles: [
        vehicle(b, { id: "1", name: "Van A", readyByDeparture: false, pluggedIn: false, status: "idle", worksToday: true, shiftUseKwh: 40, milesPerKwh: 3, diagnostics: { ...b.diagnostics, brakePadMm: 3.5, auxBatteryV: 12.6 } }),
        vehicle(b, { id: "2", name: "Van B", readyByDeparture: false, pluggedIn: true, status: "charging", worksToday: true, shiftUseKwh: 40, milesPerKwh: 2.2, diagnostics: { ...b.diagnostics, brakePadMm: 8, auxBatteryV: 12.0 } }),
        vehicle(b, { id: "3", name: "Van C", readyByDeparture: true, status: "ready", worksToday: false, milesPerKwh: 3 }),
      ],
    };
    const ins = fleetInsights(fm, 20);
    expect(ins.map((i) => i.type)).toEqual(["range_risk", "charging_cost", "maintenance", "efficiency"]);
    expect(ins[0]).toMatchObject({ severity: "high" });
    expect(ins[0].recommendation).toMatch(/Plug the unplugged/);
    expect(ins[1].metric.value).toBe(80);
    expect(ins[2].why).toMatch(/brake pads at 3.5 mm.*12V battery at 12 V/);

    // Only plugged-in vehicles at risk → the other recommendation; nothing else to flag.
    const quiet: FleetMonitor = { ...m, vehicles: [vehicle(b, { readyByDeparture: false, pluggedIn: true, status: "charging", worksToday: false })] };
    const q = fleetInsights(quiet, 20);
    expect(q.map((i) => i.type)).toEqual(["range_risk"]);
    expect(q[0]).toMatchObject({ severity: "medium" });
    expect(q[0].recommendation).toMatch(/faster chargers/);
  });

  it("solar: dirty arrays and heavy export", async () => {
    const m = await asTenant(newOrg(), () => solarMonitoring());
    const inv = m.inverters[0];
    const sm: SolarMonitor = { ...m, exportedPct: 55, inverters: [{ ...inv, status: "online", performancePct: 84 }, { ...inv, status: "online", performancePct: 99 }] };
    expect(solarInsights(sm).map((i) => i.type)).toEqual(["underperformance", "export"]);
    expect(solarInsights({ ...sm, exportedPct: 30, inverters: [] })).toEqual([]);
  });

  it("battery: mode switch, reserve and heat", async () => {
    const m = await asTenant(newOrg(), () => batteryMonitoring());
    const bm: BatteryMonitor = { ...m, operatingMode: "self-powered", backupReservePct: 30, units: [{ ...m.units[0], status: "warning", temperatureC: 43 }] };
    expect(batteryInsights(bm, 25).map((i) => i.type)).toEqual(["mode", "reserve", "health"]);
    expect(batteryInsights({ ...bm, operatingMode: "time-based", backupReservePct: 10, units: [] }, 25)).toEqual([]);
  });

  it("insights route: device insights for solar/battery/fleet using the live price spread, EV otherwise", async () => {
    const org = newOrg();
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org });
    const get = (q: string) => insightsRoute(new Request(`http://x/api/ani/insights${q}`, { headers: { Authorization: `Bearer ${token}` } }));
    for (const d of ["fleet", "solar", "battery"] as const) {
      const body = await (await get(`?device=${d}`)).json();
      expect(body).toEqual(await deviceInsights(org, d, 30));
    }
    const ev = await (await get("")).json();
    expect(Array.isArray(ev)).toBe(true);
  });
});
