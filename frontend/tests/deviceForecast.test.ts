import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/data/regions/uk", () => ({
  fetchCarbonIntensity: vi.fn(async () => null),
  fetchCarbonForecast: vi.fn(async () => null),
  fetchOctopusAgile: vi.fn(async () => null),
  fetchOctopusWindow: vi.fn(async () => null),
  fetchWeather: vi.fn(async () => null),
  fetchChargePoints: vi.fn(async () => null),
  GRID_BASELINE_GCO2: 233,
}));

import { asTenant } from "@/lib/server/context";
import { dutyCycle, fleetMonitoring, solarMonitoring, batteryMonitoring } from "@/lib/server/deviceMonitoring";
import {
  syntheticWeather, syntheticPrices, solarForecast, batteryForecast, fleetForecast, coldFactor, DEPOT_LIMIT_KW,
} from "@/lib/server/deviceForecast";
import { fetchDailyWeather, type DailyWeather } from "@/lib/data/weather";
import { GET as forecastRoute } from "@/app/api/forecasting/device/route";
import { signToken } from "@/lib/server/jwt";
import type { FleetMonitor, FleetVehicle, BatteryMonitor, SolarMonitor } from "@/lib/deviceMonitoringTypes";
import type { PriceSlot } from "@/lib/data/types";

const newOrg = () => `org-fc-${Math.random().toString(36).slice(2)}`;
afterEach(() => vi.unstubAllGlobals());

describe("vehicle duty cycle", () => {
  const base = { depMin: 7 * 60, shiftMin: 480, worksToday: true, useFrac: 0.5, plugsIn: true, startSoc: 96, chargeKw: 11, batteryKwh: 66 };

  it("drains on the road, then charges back after returning", () => {
    const mid = dutyCycle({ ...base, nowMin: 11 * 60 });
    expect(mid).toMatchObject({ onRoad: true, pluggedIn: false, charging: false, stopped: false });
    expect(mid.progress).toBeCloseTo(0.5);
    expect(mid.soc).toBeCloseTo(71);

    const evening = dutyCycle({ ...base, nowMin: 17 * 60 });
    expect(evening).toMatchObject({ onRoad: false, pluggedIn: true, charging: true });
    expect(evening.soc).toBeGreaterThan(46);
    expect(evening.socAtNextDeparture).toBe(100);

    // Early morning is still yesterday's evening charge.
    expect(dutyCycle({ ...base, nowMin: 5 * 60 }).soc).toBe(100);
  });

  it("an unplugged vehicle doesn't recover, and a rest day keeps its charge", () => {
    const unplugged = dutyCycle({ ...base, plugsIn: false, nowMin: 20 * 60 });
    expect(unplugged).toMatchObject({ pluggedIn: false, charging: false });
    expect(unplugged.soc).toBeCloseTo(46);
    expect(unplugged.socAtNextDeparture).toBeCloseTo(46);
    expect(dutyCycle({ ...base, worksToday: false, plugsIn: false, nowMin: 12 * 60 }).soc).toBe(96);
    // Parked up at the very start of the run.
    expect(dutyCycle({ ...base, nowMin: 7 * 60 + 5 }).stopped).toBe(true);
  });
});

describe("fallback feeds", () => {
  it("synthetic weather is seasonal, per-day deterministic and 7 days long", () => {
    const a = syntheticWeather(7, new Date("2026-07-01T12:00:00Z"));
    const b = syntheticWeather(7, new Date("2026-07-01T18:00:00Z"));
    expect(a).toHaveLength(7);
    expect(a).toEqual(b);
    const winter = syntheticWeather(7, new Date("2026-01-01T12:00:00Z"));
    const avg = (w: DailyWeather[]) => w.reduce((s, d) => s + d.sun_kwh_m2, 0) / w.length;
    expect(avg(a)).toBeGreaterThan(avg(winter));
  });

  it("synthetic prices cover 24h with a dearer evening peak", () => {
    const p = syntheticPrices(new Date("2026-10-10T00:10:00"));
    expect(p).toHaveLength(48);
    const at = (h: number) => p.find((s) => new Date(s.valid_from).getHours() === h)!.pence;
    expect(at(17)).toBeGreaterThan(at(2));
  });
});

describe("solar forecast", () => {
  it("scales with sun and system size, flags dirty arrays, and reports its source", async () => {
    const m = await asTenant(newOrg(), () => solarMonitoring());
    const sm: SolarMonitor = {
      ...m, capacityKwp: 100, exportedPct: 40,
      inverters: [{ ...m.inverters[0], name: "Roof", capacityKwp: 100, performancePct: 80 }],
    };
    const wx: DailyWeather[] = [
      { date: "2026-10-10", temp_min_c: 8, temp_max_c: 15, sun_kwh_m2: 2, cloud_pct: 50 },
      { date: "2026-10-11", temp_min_c: 8, temp_max_c: 15, sun_kwh_m2: 4, cloud_pct: 10 },
    ];
    const f = solarForecast(sm, wx);
    expect(f.source).toBe("live");
    expect(f.days.map((d) => d.kwh)).toEqual([128, 256]); // kWp × sun × 0.8 × 80%
    expect(f.bestDay.date).toBe("2026-10-11");
    expect(f.worstDay.date).toBe("2026-10-10");
    expect(f.days[1].high - f.days[1].low).toBeGreaterThan(f.days[0].high - f.days[0].low);
    expect(f.cleaning[0]).toMatchObject({ name: "Roof", lostKwhWeek: 96 });
    expect(f.weekExportGbp).toBeCloseTo(384 * 0.4 * 0.14, 2);

    const fallback = solarForecast({ ...sm, inverters: [] }, null);
    expect(fallback.source).toBe("synthetic");
    expect(fallback.days).toHaveLength(7);
    expect(fallback.cleaning).toEqual([]);
  });
});

describe("battery forecast", () => {
  const prices = (now: Date): PriceSlot[] =>
    Array.from({ length: 48 }, (_, i) => ({ valid_from: new Date(now.getTime() + i * 1_800_000).toISOString(), pence: i < 8 ? 8 : i >= 20 && i < 26 ? 40 : 22 }));

  it("charges in the cheap slots, discharges at the peak, never leaves the battery's limits", async () => {
    const m = await asTenant(newOrg(), () => batteryMonitoring());
    const bm: BatteryMonitor = {
      ...m, totalCapacityKwh: 20, usableCapacityKwh: 19, avgSocPct: 30, backupReservePct: 10, healthPct: 92, throughputTodayKwh: 20,
      units: [{ ...m.units[0], capacityKwh: 20 }],
    };
    const now = new Date("2026-10-10T00:00:00Z");
    const f = batteryForecast(bm, prices(now), now);
    expect(f.source).toBe("live");
    expect(f.slots.filter((s) => s.action === "charge").every((s) => s.pence === 8)).toBe(true);
    expect(f.slots.filter((s) => s.action === "discharge").every((s) => s.pence === 40)).toBe(true);
    expect(f.slots.every((s) => s.socPct >= 10 && s.socPct <= 100)).toBe(true);
    expect(f.savingGbp).toBeGreaterThan(0);
    expect(f.chargeWindow).toMatch(/–/);
    expect(f.health).toMatchObject({ nowPct: 92, fadePctPerYear: 2.2, yearsTo80: 5.5 });

    // Flat prices → nothing worth doing; health already below 80%.
    const flat = batteryForecast({ ...bm, healthPct: 78 }, prices(now).map((p) => ({ ...p, pence: 20 })), now);
    expect(flat.slots.every((s) => s.action === "hold")).toBe(true);
    expect(flat.chargeWindow).toBeNull();
    expect(flat.health.yearsTo80).toBeNull();
    expect(batteryForecast(bm, null, now).source).toBe("synthetic");
  });
});

describe("fleet forecast", () => {
  const now = new Date("2026-10-10T16:00:00");
  async function fleet(): Promise<{ m: FleetMonitor; v: FleetVehicle }> {
    const m = await asTenant(newOrg(), () => fleetMonitoring());
    return { m, v: { ...m.vehicles[0], faults: [], kind: "bus", status: "idle", pluggedIn: true, chargeRateKw: 80, batteryKwh: 300, socPct: 30, depot: "North Depot" } };
  }

  it("smart-charges in the cheapest hours within the depot limit, and costs less than charging on arrival", async () => {
    const { m, v } = await fleet();
    // Three 80 kW buses at one depot: 240 kW on arrival breaks the 150 kW limit.
    const fm: FleetMonitor = { ...m, vehicles: [1, 2, 3].map((i) => ({ ...v, id: `B${i}`, reg: `BUS ${i}`, scheduledDeparture: "07:00" })) };
    const f = fleetForecast(fm, null, null, now);
    expect(f.depotLimitKw).toBe(DEPOT_LIMIT_KW);
    const depot = f.depots[0];
    expect(depot.peakAsapKw).toBe(240);
    expect(depot.peakSmartKw).toBeLessThanOrEqual(DEPOT_LIMIT_KW);
    expect(f.totals.costSmartGbp).toBeLessThan(f.totals.costAsapGbp);
    expect(f.totals.savingGbp).toBeCloseTo(f.totals.costAsapGbp - f.totals.costSmartGbp, 2);
    expect(f.plan.every((p) => p.start && p.end)).toBe(true);
    expect(f.priceSource).toBe("synthetic");
  });

  it("vehicles on the road plug in at their return time; charged vehicles need no plan", async () => {
    const { m, v } = await fleet();
    const fm: FleetMonitor = {
      ...m,
      vehicles: [
        { ...v, id: "R", status: "in_use", returnTime: "18:00", socPct: 40, shiftUseKwh: 150 },
        { ...v, id: "F", status: "ready", socPct: 100 },
      ],
    };
    const f = fleetForecast(fm, null, null, now);
    expect(f.plan.map((p) => [p.vehicleId, p.plugIn])).toEqual([["R", "18:00"]]);
  });

  it("readiness accounts for the cold and explains each risk", async () => {
    const { m, v } = await fleet();
    const cold: DailyWeather[] = [
      { date: "2026-10-10", temp_min_c: 5, temp_max_c: 9, sun_kwh_m2: 1, cloud_pct: 80 },
      { date: "2026-10-11", temp_min_c: 1, temp_max_c: 6, sun_kwh_m2: 1, cloud_pct: 80 },
    ];
    const fm: FleetMonitor = {
      ...m,
      vehicles: [
        { ...v, id: "OK", shiftUseKwh: 60, socAtDeparturePct: 90, neededSocPct: 32 },
        { ...v, id: "COLD", shiftUseKwh: 150, socAtDeparturePct: 70, neededSocPct: 62 },
        { ...v, id: "UNPLUGGED", pluggedIn: false, status: "idle", shiftUseKwh: 150, socAtDeparturePct: 40, neededSocPct: 62 },
        { ...v, id: "SLOW", pluggedIn: true, status: "charging", shiftUseKwh: 150, socAtDeparturePct: 50, neededSocPct: 62 },
        { ...v, id: "TIGHT", shiftUseKwh: 150, socAtDeparturePct: 85, neededSocPct: 62 },
        { ...v, id: "OFF", status: "fault" },
      ],
    };
    const f = fleetForecast(fm, cold, null, now);
    expect(f.source).toBe("live");
    expect(f.tomorrow).toMatchObject({ date: "2026-10-11", tempMinC: 1, coldFactor: 1.3 });
    const by = Object.fromEntries(f.readiness.map((r) => [r.vehicleId, r]));
    expect(by.OK.risk).toBe("ok");
    expect(by.COLD).toMatchObject({ risk: "short", neededPct: 77 });
    expect(by.COLD.reason).toMatch(/1°C low/);
    expect(by.UNPLUGGED.reason).toMatch(/Not plugged in/);
    expect(by.SLOW.reason).toMatch(/doesn't put back enough/);
    expect(by.TIGHT.risk).toBe("tight");
    expect(by.OFF.risk).toBe("off_road");
    expect(f.readiness[0].marginPct).toBeLessThanOrEqual(f.readiness[1].marginPct);
  });

  it("predicts maintenance from wear and mileage, soonest first", async () => {
    const { m, v } = await fleet();
    const fault = { code: "P0A80", title: "Battery cell imbalance", component: "battery" as const, severity: "warning" as const, detail: "", action: "", firstSeen: "" };
    const fm: FleetMonitor = {
      ...m,
      vehicles: [
        { ...v, id: "W", kind: "van", odometerMiles: 24900, efficiencyKwhPerMile: 0.35, shiftUseKwh: 40, faults: [fault], diagnostics: { ...v.diagnostics, brakePadMm: 3.2, auxBatteryV: 11.8 } },
        { ...v, id: "S", kind: "bus", odometerMiles: 17900, efficiencyKwhPerMile: 1.6, shiftUseKwh: 150, diagnostics: { ...v.diagnostics, brakePadMm: 9, auxBatteryV: 12.25 } },
      ],
    };
    const items = fleetForecast(fm, null, null, now).maintenance;
    const names = items.map((i) => `${i.vehicleId}:${i.item}`);
    expect(names).toEqual(expect.arrayContaining(["W:Brake pads", "W:Tyres", "W:12V battery", "W:Battery cell imbalance", "S:12V battery", "S:Annual service"]));
    expect(items.find((i) => i.vehicleId === "W" && i.item === "12V battery")).toMatchObject({ dueInDays: 0, severity: "high" });
    expect(items.find((i) => i.vehicleId === "S" && i.item === "12V battery")).toMatchObject({ dueInDays: 21, severity: "medium" });
    expect(items.map((i) => i.dueInDays)).toEqual([...items.map((i) => i.dueInDays)].sort((a, b) => a - b));
  });

  it("cold factor steps", () => {
    expect([coldFactor(0), coldFactor(5), coldFactor(12)]).toEqual([1.3, 1.15, 1]);
  });
});

describe("daily weather fetch", () => {
  it("maps Open-Meteo daily fields (MJ → kWh) and returns null on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      daily: { time: ["2026-10-10"], temperature_2m_min: [4.04], temperature_2m_max: [12.96], shortwave_radiation_sum: [7.2], cloud_cover_mean: [61.4] },
    }))));
    expect(await fetchDailyWeather(51.5, -0.1, "Europe/London", 1)).toEqual([
      { date: "2026-10-10", temp_min_c: 4, temp_max_c: 13, sun_kwh_m2: 2, cloud_pct: 61 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    expect(await fetchDailyWeather(51.5, -0.1, "Europe/London")).toBeNull();
  });
});

describe("forecast route", () => {
  it("returns each device's forecast, rejects unknown devices, and needs a session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); // weather unavailable → fallback
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org: newOrg() });
    const get = (d: string) => forecastRoute(new Request(`http://x/api/forecasting/device?device=${d}`, { headers: { Authorization: `Bearer ${token}` } }));
    expect((await (await get("solar")).json()).days).toHaveLength(7);
    expect((await (await get("battery")).json()).slots.length).toBeGreaterThan(0);
    const fleetBody = await (await get("fleet")).json();
    expect(fleetBody).toHaveProperty("readiness");
    expect(fleetBody.source).toBe("synthetic");
    expect((await get("ev")).status).toBe(400);
    expect((await forecastRoute(new Request("http://x/api/forecasting/device?device=solar"))).status).toBe(401);
  });
});
