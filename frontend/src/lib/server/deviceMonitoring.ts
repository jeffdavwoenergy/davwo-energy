// Deterministic per-tenant mock telemetry for Solar, Battery and Fleet device
// types (EV chargers keep their own ANI-engine-backed provider). Values are
// stable per org (seeded from the tenant) with a slow 20s "live" jitter so the
// SWR refresh feels alive. In-memory only — no DB.

import { currentSeed } from "@/lib/server/context";
import type {
  SolarMonitor, SolarInverter, SolarFault,
  BatteryMonitor, BatteryUnit, BatteryMode,
  FleetMonitor, FleetVehicle, FleetStatus, DriverReimbursement,
} from "@/lib/deviceMonitoringTypes";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = (x: number, n = 1) => +x.toFixed(n);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
const tick = () => Math.floor(Date.now() / 20000); // live bucket, shifts every 20s
const nowIso = () => new Date().toISOString();
function hourFrac() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}
// Daylight bell curve, 0 at night, peak ~12:30.
function solarFactor(h: number) {
  if (h <= 5 || h >= 20) return 0;
  return Math.max(0, Math.sin((Math.PI * (h - 5)) / 15));
}
const stable = (salt: number) => mulberry32((currentSeed() ^ (salt | 0)) >>> 0);
const livey = (salt: number) => mulberry32((currentSeed() ^ (salt | 0) ^ (tick() * 2654435761)) >>> 0);

// ---------------------------------------------------------------- Solar ----
export function solarMonitoring(): SolarMonitor {
  const base = stable(0x501a2);
  const live = livey(0x501a2);
  const capacityKwp = 40 + Math.floor(base() * 460); // 40–500 kWp
  const invCount = 2 + Math.floor(base() * 4); // 2–5
  const dailyYield = 3.0 + base() * 2.6; // kWh/kWp/day
  const hf = hourFrac();
  const sf = solarFactor(hf);
  const weather = 0.8 + live() * 0.18;
  const dayElapsed = clamp((hf - 5) / 15, 0, 1);

  const currentGenerationKw = r(capacityKwp * sf * weather);
  const fullDayKwh = capacityKwp * dailyYield * weather;
  const energyTodayKwh = r(fullDayKwh * dayElapsed);
  const dayOfMonth = new Date().getDate();
  const energyMonthKwh = r(capacityKwp * dailyYield * 0.9 * (dayOfMonth - 1) + energyTodayKwh);
  const energyLifetimeKwh = r((400 + base() * 2600) * 1000 + energyMonthKwh);

  const selfConsumedPct = r(42 + base() * 26, 0); // 42–68%
  const exportedPct = r(100 - selfConsumedPct, 0);
  const selfConsumedKwh = r((energyTodayKwh * selfConsumedPct) / 100);
  const exportedKwh = r((energyTodayKwh * exportedPct) / 100);
  const exportRate = 0.14;
  const exportEarningsTodayGbp = r(exportedKwh * exportRate, 2);
  const exportEarningsMonthGbp = r(((energyMonthKwh * exportedPct) / 100) * exportRate, 2);
  const specificYield = r(capacityKwp ? energyTodayKwh / capacityKwp : 0, 2);
  const performanceRatioPct = r(clamp(weather * 100 - base() * 8, 78, 98), 0);
  const co2AvoidedKg = r(energyTodayKwh * 0.233);

  const inverters: SolarInverter[] = Array.from({ length: invCount }).map((_, i) => {
    const vr = mulberry32((currentSeed() ^ ((i + 1) * 0x51a7)) >>> 0);
    const roll = live();
    const status: SolarInverter["status"] = i === 0 && roll < 0.12 ? "warning" : roll < 0.04 ? "offline" : "online";
    const share = (0.9 + vr() * 0.2) / invCount;
    const ac = status === "offline" ? 0 : r(currentGenerationKw * share);
    const faultCode = status === "offline" ? "GridMonitoring" : status === "warning" ? "DcIsoLow" : null;
    const strN = 1 + Math.floor(vr() * 2);
    return {
      id: `INV-${String(i + 1).padStart(2, "0")}`,
      name: `Inverter ${i + 1}`,
      status,
      acPowerKw: ac,
      dcVoltage: status === "offline" ? 0 : r(600 + vr() * 160, 0),
      temperatureC: r(26 + sf * 24 + vr() * 6, 0),
      faultCode,
      strings: Array.from({ length: strN }).map((_, s) => ({
        id: `S${s + 1}`,
        powerW: status === "offline" ? 0 : r((ac * 1000) / strN, 0),
        voltage: status === "offline" ? 0 : r(360 + vr() * 90, 0),
      })),
    };
  });

  const faults: SolarFault[] = inverters
    .filter((inv) => inv.faultCode)
    .map((inv) => ({
      inverterId: inv.id,
      name: inv.name,
      code: inv.faultCode as string,
      detail:
        inv.status === "offline"
          ? "Grid monitoring trip — inverter disconnected and awaiting auto-restart"
          : "DC insulation resistance below threshold — check string wiring",
      at: new Date(Date.now() - Math.floor(live() * 3600_000)).toISOString(),
    }));

  const curve = Array.from({ length: 14 }).map((_, i) => {
    const h = 5 + i;
    const ideal = capacityKwp * solarFactor(h);
    const c = mulberry32((currentSeed() ^ (h * 7919)) >>> 0);
    const actual = h <= hf ? ideal * (0.78 + c() * 0.2) : 0;
    return { t: `${String(h).padStart(2, "0")}:00`, actual: r(actual), expected: r(ideal) };
  });

  return {
    asOf: nowIso(),
    currentGenerationKw, capacityKwp, energyTodayKwh, energyMonthKwh, energyLifetimeKwh,
    selfConsumedKwh, exportedKwh, selfConsumedPct, exportedPct, specificYield,
    performanceRatioPct, exportEarningsTodayGbp, exportEarningsMonthGbp, co2AvoidedKg,
    inverters, curve, faults,
  };
}

// -------------------------------------------------------------- Battery ----
export function batteryMonitoring(): BatteryMonitor {
  const base = stable(0xba77e);
  const live = livey(0xba77e);
  const unitCount = 1 + Math.floor(base() * 3); // 1–3
  const perUnitKwh = pick(base, [5, 10, 13.5, 16] as const);
  const totalCapacityKwh = r(unitCount * perUnitKwh, 1);
  const usableCapacityKwh = r(totalCapacityKwh * 0.95, 1);
  const backupReservePct = pick(base, [10, 20, 30] as const);
  const operatingMode = pick(base, ["self-powered", "time-based", "backup"] as const) as BatteryMode;
  const healthPct = r(88 + base() * 10, 0);
  const totalCycles = 180 + Math.floor(base() * 1700);

  const hf = hourFrac();
  const sf = solarFactor(hf);
  const avgSocPct = clamp(r(30 + sf * 60 + (live() * 10 - 5), 0), backupReservePct, 100);

  let netPowerKw = 0;
  let flow: BatteryMonitor["flow"] = "idle";
  const maxPower = perUnitKwh * unitCount * 0.5;
  if (sf > 0.3 && avgSocPct < 97) {
    netPowerKw = r(maxPower * (0.4 + sf * 0.6), 1);
    flow = "charging";
  } else if (hf >= 16.5 && hf <= 22 && avgSocPct > backupReservePct + 3) {
    netPowerKw = -r(maxPower * (0.5 + live() * 0.4), 1);
    flow = "discharging";
  }

  const throughputTodayKwh = r(totalCapacityKwh * (0.6 + live() * 1.3), 1);
  const savingsTodayGbp = r(throughputTodayKwh * 0.19, 2);
  const savingsMonthGbp = r(savingsTodayGbp * (new Date().getDate() * 0.92), 2);

  const units: BatteryUnit[] = Array.from({ length: unitCount }).map((_, i) => {
    const vr = mulberry32((currentSeed() ^ ((i + 1) * 0x9137)) >>> 0);
    return {
      id: `BAT-${String(i + 1).padStart(2, "0")}`,
      name: `Battery ${i + 1}`,
      socPct: clamp(r(avgSocPct + (vr() * 8 - 4), 0), backupReservePct, 100),
      powerKw: r(netPowerKw / unitCount, 1),
      mode: operatingMode,
      status: vr() < 0.06 ? "warning" : "online",
      healthPct: r(healthPct - vr() * 4, 0),
      cycles: Math.round(totalCycles / unitCount + vr() * 60),
      capacityKwh: perUnitKwh,
    };
  });

  const curve = Array.from({ length: 24 }).map((_, h) => {
    const sfh = solarFactor(h);
    const c = mulberry32((currentSeed() ^ (h * 2663)) >>> 0);
    const soc = clamp(30 + sfh * 55 + (h >= 17 && h <= 22 ? -18 : 0) + c() * 8, backupReservePct, 100);
    let p = 0;
    if (sfh > 0.3) p = maxPower * sfh * 0.8;
    else if (h >= 17 && h <= 22) p = -maxPower * 0.6;
    return { t: `${String(h).padStart(2, "0")}:00`, soc: r(soc, 0), power: r(p, 1) };
  });

  return {
    asOf: nowIso(),
    avgSocPct, netPowerKw, flow, backupReservePct, operatingMode,
    gridStatus: "connected", usableCapacityKwh, totalCapacityKwh, healthPct,
    totalCycles, throughputTodayKwh, savingsTodayGbp, savingsMonthGbp, units, curve,
  };
}

// ---------------------------------------------------------------- Fleet ----
const FLEET_AREAS = ["North Depot", "Central Depot", "East Hub", "Riverside Yard", "South Gate", "Airport Logistics Park"];
const FLEET_MODELS = ["eVanta 350", "Voltrix LCV", "GridRunner X2", "Ampere Cargo", "Nova E-Transit", "Pulse Panel 40"];

export function fleetMonitoring(): FleetMonitor {
  const base = stable(0xf1ee7);
  const live = livey(0xf1ee7);
  const n = 4 + Math.floor(base() * 9); // 4–12
  const driverPool = 2 + Math.floor(base() * 4); // 2–5 drivers

  const vehicles: FleetVehicle[] = Array.from({ length: n }).map((_, i) => {
    const vr = mulberry32((currentSeed() ^ ((i + 1) * 0x9e3779b1)) >>> 0);
    const lv = mulberry32((currentSeed() ^ ((i + 1) * 101) ^ tick()) >>> 0);
    const fullRange = 150 + Math.floor(vr() * 140); // 150–290 mi
    const socPct = clamp(r(15 + lv() * 82, 0), 4, 100);
    const rangeMiles = Math.round((socPct / 100) * fullRange);
    const pluggedIn = vr() < 0.62;
    const charging = pluggedIn && socPct < 93 && lv() < 0.72;
    const faulted = vr() < 0.07;
    let status: FleetStatus = "idle";
    if (faulted) status = "fault";
    else if (charging) status = "charging";
    else if (!pluggedIn && lv() < 0.45) status = "in_use";
    else if (socPct >= 70 || (pluggedIn && socPct >= 60)) status = "ready";
    const depHour = 6 + Math.floor(vr() * 3);
    const scheduledDeparture = `${String(depHour).padStart(2, "0")}:${vr() < 0.5 ? "00" : "30"}`;
    const readyByDeparture = status === "fault" ? false : socPct >= 72 || charging;
    const eff = r(0.28 + vr() * 0.17, 2); // kWh/mile
    return {
      id: `VH-${String(i + 1).padStart(3, "0")}`,
      name: pick(vr, FLEET_MODELS),
      reg: `•• ${String.fromCharCode(65 + Math.floor(vr() * 26))}${String.fromCharCode(65 + Math.floor(vr() * 26))} ${Math.floor(vr() * 9000 + 1000)}`,
      driverId: `DRV-${100 + (i % driverPool)}`,
      socPct,
      rangeMiles,
      pluggedIn,
      charging,
      status,
      locationArea: status === "in_use" ? "On route (area hidden)" : pick(vr, FLEET_AREAS),
      lastSeenMins: Math.floor(lv() * (status === "in_use" ? 14 : 60)),
      odometerMiles: 8000 + Math.floor(vr() * 62000),
      efficiencyKwhPerMile: eff,
      milesPerKwh: r(1 / eff, 2),
      costPerMileGbp: r(eff * 0.28, 2),
      batteryHealthPct: r(90 + vr() * 9, 0),
      readyByDeparture,
      scheduledDeparture,
    };
  });

  const readyCount = vehicles.filter((v) => v.readyByDeparture).length;
  const pluggedInCount = vehicles.filter((v) => v.pluggedIn).length;
  const chargingCount = vehicles.filter((v) => v.charging).length;
  const avgSocPct = r(vehicles.reduce((s, v) => s + v.socPct, 0) / vehicles.length, 0);
  const avgEfficiencyMiPerKwh = r(vehicles.reduce((s, v) => s + v.milesPerKwh, 0) / vehicles.length, 2);
  const avgCostPerMileGbp = r(vehicles.reduce((s, v) => s + v.costPerMileGbp, 0) / vehicles.length, 2);
  const fleetHealthPct = r(vehicles.reduce((s, v) => s + v.batteryHealthPct, 0) / vehicles.length, 0);

  const byDriver = new Map<string, DriverReimbursement>();
  for (const v of vehicles) {
    const dvr = mulberry32((currentSeed() ^ (v.driverId.charCodeAt(5) * 7349) ^ v.id.charCodeAt(4)) >>> 0);
    const kwh = r(6 + dvr() * 22, 1);
    const prev = byDriver.get(v.driverId);
    const entry = prev ?? { driverId: v.driverId, homeEnergyKwh: 0, reimbursementGbp: 0, sessions: 0 };
    entry.homeEnergyKwh = r(entry.homeEnergyKwh + kwh, 1);
    entry.reimbursementGbp = r(entry.reimbursementGbp + kwh * 0.29, 2);
    entry.sessions += 1 + Math.floor(dvr() * 3);
    byDriver.set(v.driverId, entry);
  }

  return {
    asOf: nowIso(),
    totalVehicles: n,
    readyCount,
    pluggedInCount,
    chargingCount,
    avgSocPct,
    avgEfficiencyMiPerKwh,
    avgCostPerMileGbp,
    fleetHealthPct,
    vehicles,
    reimbursements: Array.from(byDriver.values()).sort((a, b) => a.driverId.localeCompare(b.driverId)),
  };
}
