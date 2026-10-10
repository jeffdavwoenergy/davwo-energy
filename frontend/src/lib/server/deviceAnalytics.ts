// Historical analytics for the Solar, Battery and Fleet device types: a
// deterministic per-org, per-day history consistent with the live
// simulations (same devices, sizes and efficiencies — deviceMonitoring.ts),
// with day-to-day variation from seasonal weather (deviceForecast.ts).

import { syntheticWeather } from "@/lib/server/deviceForecast";
import type { SolarMonitor, BatteryMonitor, FleetMonitor, VehicleKind } from "@/lib/deviceMonitoringTypes";

export type AnalyticsPeriod = "day" | "week" | "month" | "quarter";
export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { day: 1, week: 7, month: 30, quarter: 90 };

const r = (x: number, n = 1) => +x.toFixed(n);
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** The last `days` days of weather, oldest first, ending yesterday. */
function pastWeather(days: number, now: Date) {
  return syntheticWeather(days, new Date(now.getTime() - days * 86_400_000));
}
const sum = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

// ---------------------------------------------------------------- Fleet -----
/** Tailpipe CO₂ of the diesel each vehicle type replaces, kg per mile. */
const DIESEL_KG_PER_MILE: Record<VehicleKind, number> = { car: 0.25, van: 0.3, bus: 1.3, truck: 1.1 };
const GRID_KG_PER_KWH = 0.19;
/** Where fleet energy comes from, and what it costs per kWh. */
const CHARGING_MIX = [
  { where: "Depot", share: 0.72, pence: 18 },
  { where: "Home (reimbursed)", share: 0.17, pence: 29 },
  { where: "Public rapid", share: 0.11, pence: 69 },
] as const;

export interface FleetAnalytics {
  period: AnalyticsPeriod;
  /** efficiencyPct: miles achieved vs each working vehicle's normal mi/kWh — isolates the weather from fleet mix. */
  days: { date: string; miles: number; kwh: number; costGbp: number; tempC: number; miPerKwh: number; efficiencyPct: number }[];
  vehicles: { id: string; name: string; reg: string; kind: VehicleKind; miles: number; kwh: number; miPerKwh: number; costPerMileGbp: number; utilisationPct: number; co2SavedKg: number }[];
  chargingMix: { where: string; kwh: number; costGbp: number; pencePerKwh: number }[];
  totals: { miles: number; kwh: number; costGbp: number; costPerMileGbp: number; co2SavedKg: number; avgMiPerKwh: number };
}

export function fleetAnalytics(m: FleetMonitor, period: AnalyticsPeriod, now = new Date()): FleetAnalytics {
  const wx = pastWeather(PERIOD_DAYS[period], now);
  const blended = sum(CHARGING_MIX, (c) => c.share * c.pence) / 100; // £/kWh
  const perVehicle = m.vehicles.map((v) => {
    const rng = mulberry32(hashStr(`${v.reg}:${period}`));
    let miles = 0;
    let kwh = 0;
    let daysWorked = 0;
    const daily = wx.map((w) => {
      const dow = new Date(w.date + "T12:00:00Z").getUTCDay();
      const works = dow !== 0 && (dow !== 6 || rng() < 0.3) && rng() > 0.08;
      // Cold days cost range: ~1.2% efficiency per °C below 15°C.
      const eff = v.milesPerKwh * Math.min(1, 1 - 0.012 * (15 - w.temp_min_c));
      const dayKwh = works ? v.shiftUseKwh * (0.7 + rng() * 0.5) : 0;
      if (works) daysWorked++;
      miles += dayKwh * eff;
      kwh += dayKwh;
      return { kwh: dayKwh, miles: dayKwh * eff, normalMiles: dayKwh * v.milesPerKwh };
    });
    return { v, miles, kwh, daysWorked, daily };
  });

  const days = wx.map((w, i) => {
    const kwh = sum(perVehicle, (p) => p.daily[i].kwh);
    const miles = sum(perVehicle, (p) => p.daily[i].miles);
    const normal = sum(perVehicle, (p) => p.daily[i].normalMiles);
    return {
      date: w.date, miles: r(miles, 0), kwh: r(kwh, 0), costGbp: r(kwh * blended, 2), tempC: w.temp_min_c,
      miPerKwh: kwh ? r(miles / kwh, 2) : 0, efficiencyPct: normal ? Math.round((miles / normal) * 100) : 100,
    };
  });
  const vehicles = perVehicle.map(({ v, miles, kwh, daysWorked }) => ({
    id: v.id, name: v.name, reg: v.reg, kind: v.kind,
    miles: r(miles, 0), kwh: r(kwh, 0),
    miPerKwh: kwh ? r(miles / kwh, 2) : 0,
    costPerMileGbp: miles ? r((kwh * blended) / miles, 3) : 0,
    utilisationPct: Math.round((daysWorked / wx.length) * 100),
    co2SavedKg: r(miles * DIESEL_KG_PER_MILE[v.kind] - kwh * GRID_KG_PER_KWH, 0),
  })).sort((a, b) => b.miPerKwh - a.miPerKwh);

  const totalKwh = sum(days, (d) => d.kwh);
  const totalMiles = sum(days, (d) => d.miles);
  return {
    period,
    days,
    vehicles,
    chargingMix: CHARGING_MIX.map((c) => ({ where: c.where, kwh: r(totalKwh * c.share, 0), costGbp: r((totalKwh * c.share * c.pence) / 100, 2), pencePerKwh: c.pence })),
    totals: {
      miles: r(totalMiles, 0), kwh: r(totalKwh, 0), costGbp: r(totalKwh * blended, 2),
      costPerMileGbp: totalMiles ? r((totalKwh * blended) / totalMiles, 3) : 0,
      co2SavedKg: r(sum(vehicles, (v) => v.co2SavedKg), 0),
      avgMiPerKwh: totalKwh ? r(totalMiles / totalKwh, 2) : 0,
    },
  };
}

// ---------------------------------------------------------------- Solar -----
export interface SolarAnalytics {
  period: AnalyticsPeriod;
  days: { date: string; kwh: number; expectedKwh: number; selfUseKwh: number; exportKwh: number; performancePct: number }[];
  arrays: { name: string; site: string; capacityKwp: number; kwh: number; kwhPerKwp: number; performancePct: number }[];
  losses: { cause: string; kwh: number }[];
  totals: { kwh: number; selfUsePct: number; exportEarningsGbp: number; selfUseValueGbp: number; co2AvoidedKg: number; avgPerformancePct: number };
}

export function solarAnalytics(m: SolarMonitor, period: AnalyticsPeriod, now = new Date()): SolarAnalytics {
  const wx = pastWeather(PERIOD_DAYS[period], now);
  // Clear-sky ideal ≈ the sunniest the season gets; the gap to it is weather.
  const clearSky = Math.max(...wx.map((w) => w.sun_kwh_m2)) * 1.1;
  let soiling = 0;
  let downtime = 0;
  let weatherLoss = 0;
  const arrays = m.inverters.map((inv) => ({ inv, kwh: 0 }));
  const days = wx.map((w) => {
    let kwh = 0;
    let expected = 0;
    for (const a of arrays) {
      const rng = mulberry32(hashStr(`${a.inv.name}:${w.date}`));
      const exp = a.inv.capacityKwp * w.sun_kwh_m2 * 0.8;
      const offline = rng() < 0.015; // the odd day an inverter trips out
      const got = offline ? exp * 0.4 : exp * (a.inv.performancePct / 100 > 0.95 ? 0.97 + rng() * 0.03 : a.inv.performancePct / 100);
      a.kwh += got;
      kwh += got;
      expected += exp;
      weatherLoss += a.inv.capacityKwp * (clearSky - w.sun_kwh_m2) * 0.8;
      if (offline) downtime += exp - got;
      else soiling += exp - got;
    }
    const selfUse = kwh * (m.selfConsumedPct / 100);
    return { date: w.date, kwh: r(kwh, 0), expectedKwh: r(expected, 0), selfUseKwh: r(selfUse, 0), exportKwh: r(kwh - selfUse, 0), performancePct: expected ? Math.round((kwh / expected) * 100) : 100 };
  });
  const totalKwh = sum(days, (d) => d.kwh);
  const exportKwh = sum(days, (d) => d.exportKwh);
  const expectedTotal = sum(days, (d) => d.expectedKwh);
  return {
    period,
    days,
    arrays: arrays
      .map(({ inv, kwh }) => ({ name: inv.name, site: inv.site, capacityKwp: inv.capacityKwp, kwh: r(kwh, 0), kwhPerKwp: inv.capacityKwp ? r(kwh / inv.capacityKwp, 1) : 0, performancePct: inv.performancePct }))
      .sort((a, b) => b.kwhPerKwp - a.kwhPerKwp),
    losses: [
      { cause: "Weather (cloud)", kwh: r(weatherLoss, 0) },
      { cause: "Dirt & shading", kwh: r(soiling, 0) },
      { cause: "Inverter downtime", kwh: r(downtime, 0) },
    ],
    totals: {
      kwh: r(totalKwh, 0),
      selfUsePct: m.selfConsumedPct,
      exportEarningsGbp: r(exportKwh * 0.14, 2),
      selfUseValueGbp: r((totalKwh - exportKwh) * 0.27, 2),
      co2AvoidedKg: r(totalKwh * 0.233, 0),
      avgPerformancePct: expectedTotal ? Math.round((totalKwh / expectedTotal) * 100) : 100,
    },
  };
}

// -------------------------------------------------------------- Battery -----
export interface BatteryAnalytics {
  period: AnalyticsPeriod;
  days: { date: string; cycles: number; chargedKwh: number; dischargedKwh: number; savingsGbp: number }[];
  savingsBySource: { source: string; gbp: number }[];
  health: { month: string; pct: number }[];
  modeTime: { mode: string; pct: number }[];
  totals: { cycles: number; chargedKwh: number; dischargedKwh: number; roundTripPct: number; savingsGbp: number };
}

export function batteryAnalytics(m: BatteryMonitor, period: AnalyticsPeriod, now = new Date()): BatteryAnalytics {
  const wx = pastWeather(PERIOD_DAYS[period], now);
  const cap = m.usableCapacityKwh;
  const rte = 0.9;
  const days = wx.map((w) => {
    const rng = mulberry32(hashStr(`bat:${m.totalCapacityKwh}:${w.date}`));
    const cycles = r(0.6 + rng() * 0.7 + (w.sun_kwh_m2 > 2.5 ? 0.2 : 0), 2);
    const charged = cap * cycles;
    const discharged = charged * rte;
    return { date: w.date, cycles, chargedKwh: r(charged, 1), dischargedKwh: r(discharged, 1), savingsGbp: r(discharged * (0.13 + rng() * 0.08), 2) };
  });
  const totalSavings = sum(days, (d) => d.savingsGbp);
  const fadePerMonth = (1 + 1.2 * Math.min(2, sum(days, (d) => d.cycles) / days.length)) / 12;
  const monthLabel = (offset: number) => new Date(now.getFullYear(), now.getMonth() - offset, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const modeShare = { "self-powered": [70, 20, 10], "time-based": [25, 68, 7], backup: [15, 10, 75] }[m.operatingMode];
  return {
    period,
    days,
    savingsBySource: [
      { source: "Cheap-rate shifting", gbp: r(totalSavings * 0.55, 2) },
      { source: "Storing solar", gbp: r(totalSavings * 0.3, 2) },
      { source: "Avoiding peak prices", gbp: r(totalSavings * 0.15, 2) },
    ],
    health: Array.from({ length: 12 }, (_, i) => ({ month: monthLabel(11 - i), pct: r(Math.min(100, m.healthPct + fadePerMonth * (11 - i)), 1) })),
    modeTime: [
      { mode: "Self-powered", pct: modeShare[0] },
      { mode: "Time-based", pct: modeShare[1] },
      { mode: "Backup", pct: modeShare[2] },
    ],
    totals: {
      cycles: r(sum(days, (d) => d.cycles), 1),
      chargedKwh: r(sum(days, (d) => d.chargedKwh), 0),
      dischargedKwh: r(sum(days, (d) => d.dischargedKwh), 0),
      roundTripPct: Math.round(rte * 100),
      savingsGbp: r(totalSavings, 2),
    },
  };
}
