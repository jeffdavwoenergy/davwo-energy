// Solar and Battery monitors built from real integrated telemetry — the live
// counterpart of deviceMonitoring.ts's simulations, in the same SolarMonitor /
// BatteryMonitor shapes so every dashboard, alert, forecast and ANI answer
// that consumes them works unchanged.
//
// Rule: every figure is measured or derived from measurements, and says how.
// What the provider doesn't report (battery state of health, cycle count,
// inverter DC voltage/temperature) is null — shown as "not reported".

import type {
  SolarMonitor, SolarInverter, BatteryMonitor, BatteryUnit,
} from "@/lib/deviceMonitoringTypes";
import type { LiveDevice } from "@/lib/server/integrations/sync";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Assumed export tariff (SEG-style), same figure as the simulated monitor. */
const EXPORT_RATE_GBP = 0.14;
/** Average value of a kWh served from the battery instead of the grid. */
const BATTERY_VALUE_GBP_PER_KWH = 0.19;
const GRID_KG_CO2_PER_KWH = 0.233;

const r = (x: number, n = 1) => +x.toFixed(n);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const hh = (ts: number) => `${String(new Date(ts).getUTCHours()).padStart(2, "0")}:00`;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

/** Mean energy at the same UTC hour over the previous 7 days — what "normal"
 * looks like for this array at this time of day, from its own history. */
function sameHourBaseline(d: LiveDevice, ts: number): number {
  const vals: number[] = [];
  for (let k = 1; k <= 7; k++) {
    const p = d.history.find((h) => h.ts === ts - k * DAY);
    if (p) vals.push(p.energyKwh);
  }
  return mean(vals);
}

export function liveSolarMonitor(devices: LiveDevice[], now = Date.now()): SolarMonitor {
  const today = dayStart(now);
  const capacityKwp = r(sum(devices.map((d) => d.capacityKw)));
  const currentGenerationKw = r(sum(devices.map((d) => num(d.telemetry.currentKw))), 2);
  const energyTodayKwh = r(sum(devices.map((d) => num(d.telemetry.todayKwh))));
  const exportedKwh = r(sum(devices.map((d) => num(d.telemetry.todayExportKwh))));
  const energyMonthKwh = r(sum(devices.map((d) => num(d.telemetry.monthKwh))));
  const monthExportKwh = sum(devices.map((d) => num(d.telemetry.monthExportKwh)));
  const selfConsumedKwh = r(Math.max(0, energyTodayKwh - exportedKwh));
  const exportedPct = energyTodayKwh > 0 ? Math.round((exportedKwh / energyTodayKwh) * 100) : 0;

  // "Performance" here is yesterday's yield against the 30-day daily average
  // — a measured relative figure (a true performance ratio needs irradiance,
  // which VRM doesn't provide).
  const daily = new Map<number, number>();
  for (const d of devices) for (const h of d.history) daily.set(dayStart(h.ts), (daily.get(dayStart(h.ts)) ?? 0) + h.energyKwh);
  const yesterday = daily.get(today - DAY);
  const pastDays = [...daily.entries()].filter(([t]) => t < today).map(([, v]) => v);
  const performanceRatioPct = yesterday != null && mean(pastDays) > 0 ? Math.round((yesterday / mean(pastDays)) * 100) : null;

  const lastHour = Math.floor(now / HOUR) * HOUR - HOUR;
  const inverters: SolarInverter[] = devices.map((d, i) => {
    const expectedKw = r(sameHourBaseline(d, lastHour), 2);
    const acPowerKw = r(num(d.telemetry.currentKw), 2);
    return {
      id: `PV-${String(i + 1).padStart(2, "0")}`,
      name: d.name,
      site: d.site,
      location: d.location ?? { lat: 0, lng: 0 },
      capacityKwp: d.capacityKw,
      status: d.status === "down" ? "offline" : d.status === "degraded" ? "warning" : "online",
      acPowerKw,
      expectedKw,
      performancePct: expectedKw > 0.05 ? Math.round((acPowerKw / expectedKw) * 100) : 100,
      dcVoltage: null,
      temperatureC: null,
      faultCode: null,
      strings: [],
    };
  });

  // Rolling last 24 complete hours (UTC) — sites span several time zones,
  // so a fixed 05:00–18:00 local window would misrepresent some of them.
  const curve = Array.from({ length: 24 }, (_, k) => {
    const ts = lastHour - (23 - k) * HOUR;
    return {
      t: hh(ts),
      actual: r(sum(devices.map((d) => d.history.find((h) => h.ts === ts)?.energyKwh ?? 0)), 2),
      expected: r(sum(devices.map((d) => sameHourBaseline(d, ts))), 2),
    };
  });

  return {
    asOf: new Date(now).toISOString(),
    source: "live",
    currentGenerationKw,
    capacityKwp,
    energyTodayKwh,
    energyMonthKwh,
    energyLifetimeKwh: null,
    selfConsumedKwh,
    exportedKwh,
    selfConsumedPct: energyTodayKwh > 0 ? 100 - exportedPct : 0,
    exportedPct,
    specificYield: capacityKwp > 0 ? r(energyTodayKwh / capacityKwp, 2) : 0,
    performanceRatioPct,
    exportEarningsTodayGbp: r(exportedKwh * EXPORT_RATE_GBP, 2),
    exportEarningsMonthGbp: r(monthExportKwh * EXPORT_RATE_GBP, 2),
    co2AvoidedKg: r(energyTodayKwh * GRID_KG_CO2_PER_KWH),
    inverters,
    curve,
    faults: [],
  };
}

/** Usable capacity from the battery's own history: energy put in while
 * charging divided by the state-of-charge it gained. Needs a meaningful
 * amount of charging (≥ 30 SoC points in total) to be trusted; slightly
 * overstates capacity by the charge losses. */
export function estimateCapacityKwh(d: LiveDevice): number | null {
  let kwh = 0;
  let dsoc = 0;
  const h = d.history;
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1].socPct;
    const b = h[i].socPct;
    if (a == null || b == null || h[i].ts - h[i - 1].ts !== HOUR) continue;
    if (h[i].powerKw > 0 && b > a) {
      kwh += h[i].powerKw;
      dsoc += b - a;
    }
  }
  return dsoc >= 30 ? r(kwh / (dsoc / 100)) : null;
}

export function liveBatteryMonitor(devices: LiveDevice[], now = Date.now()): BatteryMonitor {
  const caps = devices.map((d) => estimateCapacityKwh(d));
  const units: BatteryUnit[] = devices.map((d, i) => {
    const soc = num(d.telemetry.socPct);
    return {
      id: `BAT-${String(i + 1).padStart(2, "0")}`,
      name: d.name,
      site: d.site,
      location: d.location ?? { lat: 0, lng: 0 },
      socPct: Math.round(soc),
      powerKw: r(num(d.telemetry.powerKw), 2),
      mode: "self-powered",
      status: d.status === "down" ? "offline" : soc < 10 ? "warning" : "online",
      healthPct: null,
      cycles: null,
      // Without an estimate, fall back to the 2-hour rule of thumb the
      // simulated monitor uses — flagged in capacityNote below.
      capacityKwh: caps[i] ?? r(d.capacityKw * 2),
      temperatureC: null,
    };
  });
  const totalCapacityKwh = r(sum(units.map((u) => u.capacityKwh)));
  const netPowerKw = r(sum(units.map((u) => u.powerKw)), 2);
  const weightedSoc = totalCapacityKwh > 0
    ? sum(units.map((u) => u.socPct * u.capacityKwh)) / totalCapacityKwh
    : mean(units.map((u) => u.socPct));

  const since = now - DAY;
  const throughputTodayKwh = r(sum(devices.flatMap((d) => d.history.filter((h) => h.ts >= since && h.powerKw < 0).map((h) => -h.powerKw))));
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const monthDischarge = sum(devices.flatMap((d) => d.history.filter((h) => h.ts >= monthStart && h.powerKw < 0).map((h) => -h.powerKw)));
  // Reserve: the lowest SoC the batteries actually went to over the window —
  // observed behaviour, not a configured setting VRM doesn't expose.
  const socs = devices.flatMap((d) => d.history.map((h) => h.socPct).filter((x): x is number => x != null));
  const backupReservePct = socs.length ? Math.max(0, Math.floor(Math.min(...socs) / 5) * 5) : 0;

  const lastHour = Math.floor(now / HOUR) * HOUR - HOUR;
  const curve = Array.from({ length: 24 }, (_, k) => {
    const ts = lastHour - (23 - k) * HOUR;
    const pts = devices.map((d) => d.history.find((h) => h.ts === ts)).filter(Boolean);
    return {
      t: hh(ts),
      soc: Math.round(mean(pts.map((p) => p!.socPct ?? 0))),
      power: r(sum(pts.map((p) => p!.powerKw)), 2),
    };
  });

  const estimated = caps.filter((c) => c != null).length;
  return {
    asOf: new Date(now).toISOString(),
    source: "live",
    capacityNote: estimated === devices.length
      ? "Capacity estimated from 30 days of charge energy vs SoC gained"
      : `Capacity estimated for ${estimated} of ${devices.length}; the rest assume 2 h at rated power`,
    avgSocPct: Math.round(weightedSoc),
    netPowerKw,
    flow: netPowerKw > 0.05 ? "charging" : netPowerKw < -0.05 ? "discharging" : "idle",
    backupReservePct,
    operatingMode: "self-powered",
    gridStatus: devices.every((d) => d.telemetry.siteGridKw == null) ? "islanded" : "connected",
    usableCapacityKwh: totalCapacityKwh,
    totalCapacityKwh,
    healthPct: null,
    totalCycles: null,
    throughputTodayKwh,
    savingsTodayGbp: r(throughputTodayKwh * BATTERY_VALUE_GBP_PER_KWH, 2),
    savingsMonthGbp: r(monthDischarge * BATTERY_VALUE_GBP_PER_KWH, 2),
    units,
    curve,
  };
}
