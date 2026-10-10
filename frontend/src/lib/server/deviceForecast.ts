// Forecasts for the Solar, Battery and Fleet device types. Pure functions over
// the org's device simulations (deviceMonitoring.ts) plus two real feeds when
// available — Open-Meteo's daily weather and the region's half-hourly power
// prices — with deterministic fallbacks so the page always works.

import type { DailyWeather } from "@/lib/data/weather";
import type { PriceSlot } from "@/lib/data/types";
import type { SolarMonitor, BatteryMonitor, FleetMonitor, FleetVehicle } from "@/lib/deviceMonitoringTypes";

const r = (x: number, n = 1) => +x.toFixed(n);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
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
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const hhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

export type FeedSource = "live" | "synthetic";

// ------------------------------------------------------------ fallbacks -----
// UK-typical daily sun (kWh/m²) by month, Jan..Dec.
const UK_SUN = [0.7, 1.3, 2.3, 3.6, 4.6, 5.0, 4.9, 4.1, 2.9, 1.7, 0.9, 0.6];
const UK_TMIN = [1, 1, 3, 5, 8, 11, 13, 13, 10, 7, 4, 2];

/** Deterministic weather for the next `days` days when the live feed is
 * unavailable — seasonal, varied day to day, the same for everyone that day. */
export function syntheticWeather(days = 7, from = new Date()): DailyWeather[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    const date = isoDay(d);
    const rng = mulberry32(hashStr(date));
    const m = d.getUTCMonth();
    const cloud = Math.round(25 + rng() * 65);
    return {
      date,
      temp_min_c: r(UK_TMIN[m] + (rng() * 6 - 3)),
      temp_max_c: r(UK_TMIN[m] + 6 + rng() * 6),
      sun_kwh_m2: r(UK_SUN[m] * (1.35 - cloud / 100), 2),
      cloud_pct: cloud,
    };
  });
}

/** Agile-style half-hourly prices for the next 24h when live prices are
 * unavailable: cheap overnight, mid daytime, a 16:00–19:00 peak. */
export function syntheticPrices(from = new Date()): PriceSlot[] {
  const start = new Date(from);
  start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
  return Array.from({ length: 48 }, (_, i) => {
    const t = new Date(start.getTime() + i * 1_800_000);
    const h = t.getHours() + t.getMinutes() / 60;
    const pence = h < 5 ? 11 + h : h < 7 ? 17 : h < 16 ? 22 + Math.sin(h) * 2 : h < 19 ? 36 : h < 23 ? 24 : 15;
    return { valid_from: t.toISOString(), pence: r(pence, 2) };
  });
}

// ---------------------------------------------------------------- Solar -----
export interface SolarForecastDay {
  date: string;
  kwh: number;
  low: number;
  high: number;
  cloudPct: number;
  tempMaxC: number;
  sunKwhM2: number;
}
export interface SolarForecast {
  source: FeedSource;
  days: SolarForecastDay[];
  weekKwh: number;
  weekExportGbp: number;
  weekSelfUseValueGbp: number;
  bestDay: SolarForecastDay;
  worstDay: SolarForecastDay;
  cleaning: { name: string; site: string; performancePct: number; lostKwhWeek: number; lostGbpWeek: number }[];
}

export function solarForecast(m: SolarMonitor, weather: DailyWeather[] | null): SolarForecast {
  const source: FeedSource = weather?.length ? "live" : "synthetic";
  const wx = weather?.length ? weather : syntheticWeather();
  // Fleet-wide efficiency today (dirty arrays included) applied forward.
  const perf = m.inverters.length ? m.inverters.reduce((s, i) => s + i.performancePct, 0) / m.inverters.length / 100 : 1;
  const days = wx.map((w, i) => {
    const kwh = m.capacityKwp * w.sun_kwh_m2 * 0.8 * perf;
    const spread = 0.1 + i * 0.025; // wider further out
    return {
      date: w.date, kwh: r(kwh, 0), low: r(kwh * (1 - spread), 0), high: r(kwh * (1 + spread), 0),
      cloudPct: w.cloud_pct, tempMaxC: w.temp_max_c, sunKwhM2: w.sun_kwh_m2,
    };
  });
  const weekKwh = r(days.reduce((s, d) => s + d.kwh, 0), 0);
  const exportShare = m.exportedPct / 100;
  const sunWeek = days.reduce((s, d) => s + d.sunKwhM2, 0);
  return {
    source,
    days,
    weekKwh,
    weekExportGbp: r(weekKwh * exportShare * 0.14, 2),
    weekSelfUseValueGbp: r(weekKwh * (1 - exportShare) * 0.27, 2),
    bestDay: days.reduce((a, b) => (b.kwh > a.kwh ? b : a)),
    worstDay: days.reduce((a, b) => (b.kwh < a.kwh ? b : a)),
    cleaning: m.inverters
      .filter((i) => i.performancePct < 90)
      .map((i) => {
        const lost = i.capacityKwp * sunWeek * 0.8 * (1 - i.performancePct / 100);
        return { name: i.name, site: i.site, performancePct: i.performancePct, lostKwhWeek: r(lost, 0), lostGbpWeek: r(lost * 0.2, 2) };
      }),
  };
}

// -------------------------------------------------------------- Battery -----
export interface BatteryPlanSlot { time: string; pence: number; action: "charge" | "discharge" | "hold"; socPct: number }
export interface BatteryForecast {
  source: FeedSource;
  slots: BatteryPlanSlot[];
  chargeKwh: number;
  dischargeKwh: number;
  savingGbp: number;
  chargeWindow: string | null;
  dischargeWindow: string | null;
  health: { nowPct: number; fadePctPerYear: number; yearsTo80: number | null; reaches80: string | null };
}

const windowOf = (slots: BatteryPlanSlot[], action: BatteryPlanSlot["action"]) => {
  const hit = slots.filter((s) => s.action === action);
  if (!hit.length) return null;
  const end = new Date(new Date(hit[hit.length - 1].time).getTime() + 1_800_000);
  const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(new Date(hit[0].time))}–${fmt(end)}`;
};

/** Tomorrow's plan: charge in the cheapest half-hours, discharge in the
 * dearest, simulated in time order so the battery never over- or under-fills. */
export function batteryForecast(m: BatteryMonitor, prices: PriceSlot[] | null, now = new Date()): BatteryForecast {
  const source: FeedSource = prices?.length ? "live" : "synthetic";
  const upcoming = (prices?.length ? prices : syntheticPrices(now))
    .filter((p) => new Date(p.valid_from).getTime() > now.getTime() - 1_800_000)
    .slice(0, 48);
  const powerKw = m.units.reduce((s, u) => s + Math.abs(u.capacityKwh) * 0.5, 0) || 5;
  const slotKwh = powerKw * 0.5;
  const cap = m.totalCapacityKwh;
  const floor = (m.backupReservePct / 100) * cap;
  const n = Math.max(1, Math.ceil((m.usableCapacityKwh - floor) / slotKwh));
  const sorted = [...upcoming].map((p) => p.pence).sort((a, b) => a - b);
  const cheap = sorted[Math.min(n, sorted.length) - 1];
  const dear = sorted[Math.max(0, sorted.length - n)];
  const worthIt = dear > cheap / 0.9 + 2; // beats round-trip losses + a margin

  let kwh = (m.avgSocPct / 100) * cap;
  let chargeKwh = 0;
  let dischargeKwh = 0;
  let pence = 0;
  const slots = upcoming.map((p) => {
    let action: BatteryPlanSlot["action"] = "hold";
    if (worthIt && p.pence <= cheap && kwh < cap) {
      const e = Math.min(slotKwh, cap - kwh);
      kwh += e * 0.95;
      chargeKwh += e;
      pence -= e * p.pence;
      action = "charge";
    } else if (worthIt && p.pence >= dear && kwh > floor) {
      const e = Math.min(slotKwh, kwh - floor);
      kwh -= e;
      dischargeKwh += e;
      pence += e * p.pence;
      action = "discharge";
    }
    return { time: p.valid_from, pence: p.pence, action, socPct: Math.round((kwh / cap) * 100) };
  });

  const cyclesPerDay = clamp(m.throughputTodayKwh / Math.max(1, cap), 0.2, 2);
  const fade = r(1 + 1.2 * cyclesPerDay, 1);
  const yearsTo80 = m.healthPct > 80 ? r((m.healthPct - 80) / fade, 1) : null;
  return {
    source,
    slots,
    chargeKwh: r(chargeKwh),
    dischargeKwh: r(dischargeKwh),
    savingGbp: r(Math.max(0, pence) / 100, 2),
    chargeWindow: windowOf(slots, "charge"),
    dischargeWindow: windowOf(slots, "discharge"),
    health: {
      nowPct: m.healthPct,
      fadePctPerYear: fade,
      yearsTo80,
      reaches80: yearsTo80 == null ? null : String(now.getFullYear() + Math.round(yearsTo80)),
    },
  };
}

// ---------------------------------------------------------------- Fleet -----
/** Assumed depot grid connection when none is recorded. */
export const DEPOT_LIMIT_KW = 150;

export interface FleetChargePlan {
  vehicleId: string;
  name: string;
  reg: string;
  depot: string;
  plugIn: string;
  departure: string;
  energyKwh: number;
  hours: number;
  /** Smart schedule (cheapest hours within the depot limit). */
  start: string | null;
  end: string | null;
  costAsapGbp: number;
  costSmartGbp: number;
}
export interface DepotLoad {
  depot: string;
  limitKw: number;
  peakAsapKw: number;
  peakSmartKw: number;
  hours: { hour: string; asap: number; smart: number; pence: number }[];
}
export interface ReadinessRow {
  vehicleId: string;
  name: string;
  reg: string;
  departure: string;
  projectedPct: number;
  neededPct: number;
  marginPct: number;
  risk: "ok" | "tight" | "short" | "off_road";
  reason: string;
}
export interface MaintenanceItem {
  vehicleId: string;
  name: string;
  reg: string;
  item: string;
  dueInDays: number;
  dueDate: string;
  severity: "high" | "medium" | "low";
  basis: string;
}
export interface FleetForecast {
  source: FeedSource;
  priceSource: FeedSource;
  tomorrow: { date: string; tempMinC: number; coldFactor: number };
  depotLimitKw: number;
  plan: FleetChargePlan[];
  depots: DepotLoad[];
  totals: { energyKwh: number; costAsapGbp: number; costSmartGbp: number; savingGbp: number };
  readiness: ReadinessRow[];
  maintenance: MaintenanceItem[];
}

/** Cold weather costs range: heating, and slower battery chemistry. */
export function coldFactor(tempMinC: number) {
  return tempMinC < 3 ? 1.3 : tempMinC < 8 ? 1.15 : 1;
}

/** Hourly price for the next 24 hours starting at `startHour` (index 0). */
function hourlyPrices(prices: PriceSlot[], startHour: number): number[] {
  const byHour = new Map<number, number[]>();
  for (const p of prices) {
    const h = new Date(p.valid_from).getHours();
    byHour.set(h, [...(byHour.get(h) ?? []), p.pence]);
  }
  const fallback = prices.reduce((s, p) => s + p.pence, 0) / Math.max(1, prices.length);
  return Array.from({ length: 24 }, (_, i) => {
    const v = byHour.get((startHour + i) % 24);
    return v ? v.reduce((a, b) => a + b, 0) / v.length : fallback;
  });
}

/** Energy to put back before the next run: back to 90% (or what the run needs). */
function energyNeeded(v: FleetVehicle) {
  const target = Math.max(90, v.neededSocPct);
  if (v.status === "in_use") {
    const endSoc = Math.max(5, v.socPct - (v.shiftUseKwh / v.batteryKwh) * 100 * 0.4);
    return ((target - endSoc) / 100) * v.batteryKwh;
  }
  return Math.max(0, ((target - v.socPct) / 100) * v.batteryKwh);
}

export function fleetForecast(
  m: FleetMonitor,
  weather: DailyWeather[] | null,
  prices: PriceSlot[] | null,
  now = new Date(),
  depotLimitKw = DEPOT_LIMIT_KW,
): FleetForecast {
  const wx = weather?.length ? weather : syntheticWeather(2, now);
  const tomorrowWx = wx[1] ?? wx[0];
  const cf = coldFactor(tomorrowWx.temp_min_c);
  const startHour = now.getHours();
  const price = hourlyPrices(prices?.length ? prices : syntheticPrices(now), startHour);
  const hourLabel = (i: number) => `${String((startHour + i) % 24).padStart(2, "0")}:00`;
  // hour index (0 = this hour) of a clock time, always in the coming 24h
  const idxOf = (hm: string) => ((Math.floor(toMin(hm) / 60) - startHour) % 24 + 24) % 24;

  const depots = new Map<string, { asap: number[]; smart: number[] }>();
  const depotOf = (d: string) => {
    if (!depots.has(d)) depots.set(d, { asap: Array(24).fill(0), smart: Array(24).fill(0) });
    return depots.get(d)!;
  };

  // Biggest jobs are scheduled first so they get the cheapest hours.
  const candidates = m.vehicles
    .filter((v) => v.status !== "fault")
    .map((v) => ({ v, energy: energyNeeded(v) }))
    .filter((c) => c.energy > 0.5)
    .sort((a, b) => b.energy - a.energy);

  const plan: FleetChargePlan[] = candidates.map(({ v, energy }) => {
    const plugIn = v.status === "in_use" ? v.returnTime : hhmm(now.getHours() * 60 + now.getMinutes());
    const from = idxOf(plugIn);
    let to = idxOf(v.scheduledDeparture);
    if (to <= from) to = 24; // departure is beyond the 24h view
    const hoursNeeded = energy / v.chargeRateKw;
    const load = depotOf(v.depot);

    // ASAP: charge from plug-in at full rate.
    let left = energy;
    let costAsap = 0;
    for (let h = from; h < 24 && left > 0; h++) {
      const e = Math.min(v.chargeRateKw, left);
      load.asap[h] += e;
      costAsap += e * price[h];
      left -= e;
    }
    // Smart: cheapest hours inside the window, without breaking the depot limit.
    left = energy;
    let costSmart = 0;
    const used: number[] = [];
    const hours = Array.from({ length: to - from }, (_, k) => from + k).sort((a, b) => price[a] - price[b]);
    for (const h of hours) {
      if (left <= 0) break;
      const room = Math.max(0, depotLimitKw - load.smart[h]);
      const e = Math.min(v.chargeRateKw, left, room);
      if (e <= 0) continue;
      load.smart[h] += e;
      costSmart += e * price[h];
      left -= e;
      used.push(h);
    }
    used.sort((a, b) => a - b);
    return {
      vehicleId: v.id, name: v.name, reg: v.reg, depot: v.depot, plugIn, departure: v.scheduledDeparture,
      energyKwh: r(energy), hours: r(hoursNeeded),
      start: used.length ? hourLabel(used[0]) : null,
      end: used.length ? hourLabel(used[used.length - 1] + 1) : null,
      costAsapGbp: r(costAsap / 100, 2),
      costSmartGbp: r(costSmart / 100, 2),
    };
  });

  const depotLoads: DepotLoad[] = [...depots.entries()].map(([depot, l]) => ({
    depot,
    limitKw: depotLimitKw,
    peakAsapKw: r(Math.max(...l.asap), 0),
    peakSmartKw: r(Math.max(...l.smart), 0),
    hours: l.asap.map((a, i) => ({ hour: hourLabel(i), asap: r(a, 0), smart: r(l.smart[i], 0), pence: r(price[i], 1) })),
  }));

  const readiness: ReadinessRow[] = m.vehicles.map((v) => {
    const base = { vehicleId: v.id, name: v.name, reg: v.reg, departure: v.scheduledDeparture };
    if (v.status === "fault") {
      return { ...base, projectedPct: v.socAtDeparturePct, neededPct: v.neededSocPct, marginPct: 0, risk: "off_road" as const, reason: "Off the road with a critical fault." };
    }
    const runPct = (v.shiftUseKwh / v.batteryKwh) * 100;
    const needed = Math.min(100, Math.round(runPct * cf + 12));
    const margin = v.socAtDeparturePct - needed;
    const risk: ReadinessRow["risk"] = margin < 0 ? "short" : margin < 10 ? "tight" : "ok";
    const reason = risk === "ok"
      ? `Plenty in hand — ${margin}% spare.`
      : !v.pluggedIn && v.status !== "in_use"
        ? "Not plugged in — it won't charge before it leaves."
        : cf > 1 && margin < 0 && v.socAtDeparturePct >= v.neededSocPct
          ? `Fine on a mild day, but tomorrow's ${tomorrowWx.temp_min_c}°C low cuts its range by about ${Math.round((cf - 1) * 100)}%.`
          : `Charging at ${v.chargeRateKw} kW doesn't put back enough before ${v.scheduledDeparture}.`;
    return { ...base, projectedPct: v.socAtDeparturePct, neededPct: needed, marginPct: margin, risk, reason };
  }).sort((a, b) => a.marginPct - b.marginPct);

  const maintenance: MaintenanceItem[] = [];
  for (const v of m.vehicles) {
    const rng = mulberry32(hashStr(v.reg));
    const dailyMiles = Math.max(5, (v.shiftUseKwh / v.efficiencyKwhPerMile) * (5 / 7));
    const push = (item: string, days: number, severity: MaintenanceItem["severity"], basis: string) =>
      maintenance.push({
        vehicleId: v.id, name: v.name, reg: v.reg, item, severity, basis,
        dueInDays: Math.max(0, Math.round(days)), dueDate: isoDay(addDays(now, Math.max(0, Math.round(days)))),
      });
    // Brake pads wear 0.2–0.5 mm per 1,000 miles (regen braking spares them).
    const wear = 0.2 + rng() * 0.3;
    const padDays = ((v.diagnostics.brakePadMm - 3) / wear) * (1000 / dailyMiles);
    if (padDays < 90) {
      push("Brake pads", padDays, padDays < 14 ? "high" : "medium", `${v.diagnostics.brakePadMm} mm left, wearing ${wear.toFixed(2)} mm per 1,000 mi at ~${Math.round(dailyMiles)} mi/day`);
    }
    const interval = v.kind === "car" || v.kind === "van" ? 25000 : 60000;
    const tyreDays = (interval - (v.odometerMiles % interval)) / dailyMiles;
    if (tyreDays < 90) push("Tyres", tyreDays, "medium", `Replacement due every ${interval.toLocaleString("en-GB")} mi; ${v.odometerMiles.toLocaleString("en-GB")} mi on the clock`);
    // (a 12V fault is already listed below as an open fault)
    if (v.diagnostics.auxBatteryV < 12.3 && !v.faults.some((f) => f.component === "aux_battery")) {
      push("12V battery", v.diagnostics.auxBatteryV < 12 ? 0 : 21, v.diagnostics.auxBatteryV < 12 ? "high" : "medium", `Resting at ${v.diagnostics.auxBatteryV} V (healthy is 12.4 V+)`);
    }
    const serviceDays = (18000 - (v.odometerMiles % 18000)) / dailyMiles;
    if (serviceDays < 60) push("Annual service", serviceDays, "low", "Every 18,000 mi or 12 months");
    for (const f of v.faults.filter((x) => x.severity !== "info")) {
      push(f.title, 0, f.severity === "critical" ? "high" : "medium", `Open fault ${f.code}`);
    }
  }
  maintenance.sort((a, b) => a.dueInDays - b.dueInDays || (a.severity < b.severity ? -1 : 1));

  const totals = plan.reduce(
    (t, p) => ({
      energyKwh: t.energyKwh + p.energyKwh, costAsapGbp: t.costAsapGbp + p.costAsapGbp,
      costSmartGbp: t.costSmartGbp + p.costSmartGbp, savingGbp: 0,
    }),
    { energyKwh: 0, costAsapGbp: 0, costSmartGbp: 0, savingGbp: 0 },
  );

  return {
    source: weather?.length ? "live" : "synthetic",
    priceSource: prices?.length ? "live" : "synthetic",
    tomorrow: { date: tomorrowWx.date, tempMinC: tomorrowWx.temp_min_c, coldFactor: cf },
    depotLimitKw,
    plan,
    depots: depotLoads,
    totals: {
      energyKwh: r(totals.energyKwh),
      costAsapGbp: r(totals.costAsapGbp, 2),
      costSmartGbp: r(totals.costSmartGbp, 2),
      savingGbp: r(totals.costAsapGbp - totals.costSmartGbp, 2),
    },
    readiness,
    maintenance,
  };
}
