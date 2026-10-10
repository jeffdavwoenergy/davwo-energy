import { describe, it, expect } from "vitest";
import { asTenant } from "@/lib/server/context";
import { fleetMonitoring, solarMonitoring, batteryMonitoring } from "@/lib/server/deviceMonitoring";
import { fleetAnalytics, solarAnalytics, batteryAnalytics, PERIOD_DAYS } from "@/lib/server/deviceAnalytics";
import { GET as analyticsRoute } from "@/app/api/analytics/device/route";
import { signToken } from "@/lib/server/jwt";

const now = new Date("2026-10-10T12:00:00Z");
const org = () => `org-an-${Math.random().toString(36).slice(2)}`;

describe("fleet analytics", () => {
  it("adds up per-day and per-vehicle figures consistently, and is stable", async () => {
    const m = await asTenant(org(), () => fleetMonitoring());
    const a = fleetAnalytics(m, "month", now);
    expect(a.days).toHaveLength(PERIOD_DAYS.month);
    expect(a.vehicles).toHaveLength(m.vehicles.length);
    const vehicleMiles = a.vehicles.reduce((s, v) => s + v.miles, 0);
    expect(Math.abs(vehicleMiles - a.totals.miles)).toBeLessThan(a.vehicles.length + a.days.length);
    expect(a.chargingMix.map((c) => c.where)).toEqual(["Depot", "Home (reimbursed)", "Public rapid"]);
    expect(a.chargingMix.reduce((s, c) => s + c.costGbp, 0)).toBeCloseTo(a.totals.costGbp, 0);
    expect(a.totals.co2SavedKg).toBeGreaterThan(0);
    // Colder days are less efficient, independent of which vehicles worked.
    const worked = a.days.filter((d) => d.kwh > 0);
    const cold = worked.filter((d) => d.tempC < 5);
    const mild = worked.filter((d) => d.tempC >= 12);
    const avg = (xs: typeof worked) => xs.reduce((s, d) => s + d.efficiencyPct, 0) / xs.length;
    if (cold.length && mild.length) expect(avg(cold)).toBeLessThan(avg(mild));
    expect(worked.every((d) => d.efficiencyPct <= 100)).toBe(true);
    // League table: most efficient first.
    expect(a.vehicles.map((v) => v.miPerKwh)).toEqual([...a.vehicles.map((v) => v.miPerKwh)].sort((x, y) => y - x));
    expect(a.vehicles.every((v) => v.utilisationPct >= 0 && v.utilisationPct <= 100)).toBe(true);
    expect(fleetAnalytics(m, "month", now)).toEqual(a);
    expect(fleetAnalytics(m, "week", now).days).toHaveLength(7);
  });

  it("an empty fleet reports zeros, not NaN", async () => {
    const m = await asTenant(org(), () => fleetMonitoring());
    const a = fleetAnalytics({ ...m, vehicles: [] }, "week", now);
    expect(a.totals).toMatchObject({ miles: 0, kwh: 0, costPerMileGbp: 0, avgMiPerKwh: 0 });
    expect(a.days.every((d) => d.miPerKwh === 0 && d.efficiencyPct === 100)).toBe(true);
  });
});

describe("solar analytics", () => {
  it("ranks arrays by kWh per kWp and attributes losses", async () => {
    const m = await asTenant(org(), () => solarMonitoring());
    const inv = m.inverters[0];
    const sm = { ...m, inverters: [{ ...inv, name: "Clean", capacityKwp: 50, performancePct: 99 }, { ...inv, name: "Dirty", capacityKwp: 100, performancePct: 82 }] };
    const a = solarAnalytics(sm, "quarter", now);
    expect(a.days).toHaveLength(90);
    expect(a.arrays.map((x) => x.name)).toEqual(["Clean", "Dirty"]);
    expect(a.losses.map((l) => l.cause)).toEqual(["Weather (cloud)", "Dirt & shading", "Inverter downtime"]);
    expect(a.losses[1].kwh).toBeGreaterThan(0);
    expect(a.totals.avgPerformancePct).toBeLessThan(100);
    expect(a.days.every((d) => Math.abs(d.selfUseKwh + d.exportKwh - d.kwh) <= 1)).toBe(true);

    const none = solarAnalytics({ ...sm, inverters: [] }, "week", now);
    expect(none.totals).toMatchObject({ kwh: 0, avgPerformancePct: 100 });
    expect(none.days.every((d) => d.performancePct === 100)).toBe(true);
    const zero = solarAnalytics({ ...sm, inverters: [{ ...inv, capacityKwp: 0, performancePct: 99 }] }, "week", now);
    expect(zero.arrays[0].kwhPerKwp).toBe(0);
  });
});

describe("battery analytics", () => {
  it("cycles, savings split, 12-month health and time in mode", async () => {
    const m = await asTenant(org(), () => batteryMonitoring());
    for (const mode of ["self-powered", "time-based", "backup"] as const) {
      const a = batteryAnalytics({ ...m, operatingMode: mode, healthPct: 90 }, "month", now);
      expect(a.days).toHaveLength(30);
      expect(a.savingsBySource.reduce((s, x) => s + x.gbp, 0)).toBeCloseTo(a.totals.savingsGbp, 1);
      expect(a.health).toHaveLength(12);
      expect(a.health[11].pct).toBe(90);
      expect(a.health[0].pct).toBeGreaterThan(90);
      expect(a.modeTime.reduce((s, x) => s + x.pct, 0)).toBe(100);
      expect(a.totals.dischargedKwh).toBeLessThan(a.totals.chargedKwh);
    }
  });
});

describe("analytics route", () => {
  it("serves each device and period, and validates input", async () => {
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org: org() });
    const get = (q: string) => analyticsRoute(new Request(`http://x/api/analytics/device?${q}`, { headers: { Authorization: `Bearer ${token}` } }));
    expect((await (await get("device=fleet&period=week")).json()).days).toHaveLength(7);
    expect((await (await get("device=solar")).json()).period).toBe("month");
    expect((await (await get("device=battery&period=quarter")).json()).days).toHaveLength(90);
    expect((await get("device=ev")).status).toBe(400);
    expect((await get("device=fleet&period=decade")).status).toBe(400);
  });
});
