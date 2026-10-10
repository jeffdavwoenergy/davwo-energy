// Deterministic per-tenant mock telemetry for Solar, Battery and Fleet device
// types (EV chargers keep their own ANI-engine-backed provider). Values are
// stable per org (seeded from the tenant) with a slow 20s "live" jitter so the
// SWR refresh feels alive. In-memory only — no DB.
//
// When an org has registered its own devices of a type in Assets, those
// devices replace the demo set (source: "assets"): names, sizes, depots and
// registrations come from the register, and each device's telemetry is
// simulated from a seed derived from its asset id, so it stays stable.

import { currentSeed } from "@/lib/server/context";
import type { UserAsset } from "@/lib/server/assetsStore";
import { vehicleKindOf } from "@/lib/assetSpecs";
import type {
  LatLng,
  SolarMonitor, SolarInverter, SolarFault,
  BatteryMonitor, BatteryUnit, BatteryMode,
  FleetMonitor, FleetVehicle, FleetStatus, DriverReimbursement,
  VehicleKind, VehicleFault, VehicleComponent, VehicleDiagnostics, FaultSeverity,
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
const hourBucket = () => Math.floor(Date.now() / 3_600_000); // device states change at most hourly
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
/** Stable 32-bit hash of a string (FNV-1a) — seeds per-asset simulations. */
function hashStr(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const stable = (salt: number) => mulberry32((currentSeed() ^ (salt | 0)) >>> 0);
const livey = (salt: number) => mulberry32((currentSeed() ^ (salt | 0) ^ (tick() * 2654435761)) >>> 0);

// ---------------------------------------------------------------- Sites ----
// Demo sites sit around the same London area as the engine's charge points,
// so every device type lands on the same part of the Network Map.
const SITES: { name: string; location: LatLng }[] = [
  { name: "North Depot", location: { lat: 51.556, lng: -0.112 } },
  { name: "Central Depot", location: { lat: 51.514, lng: -0.105 } },
  { name: "East Hub", location: { lat: 51.515, lng: 0.005 } },
  { name: "Riverside Yard", location: { lat: 51.486, lng: -0.124 } },
  { name: "South Gate", location: { lat: 51.44, lng: -0.11 } },
  { name: "Airport Logistics Park", location: { lat: 51.47, lng: -0.454 } },
];
const CENTRE: LatLng = { lat: 51.505, lng: -0.15 };

/** A known demo site's coordinates, or a stable spot near the centre for any
 * other site name (registered assets don't carry coordinates yet). */
export function siteLocation(name: string): LatLng {
  const known = SITES.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (known) return known.location;
  const rng = mulberry32(hashStr(name.trim().toLowerCase()));
  return offset(CENTRE, 3 + rng() * 12, rng() * Math.PI * 2);
}
/** Move `km` kilometres from `p` on bearing `angle` (radians). */
function offset(p: LatLng, km: number, angle: number): LatLng {
  const dLat = (km * Math.cos(angle)) / 111;
  const dLng = (km * Math.sin(angle)) / (111 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: r(p.lat + dLat, 5), lng: r(p.lng + dLng, 5) };
}
const near = (p: LatLng, rng: () => number, km = 0.25) => offset(p, rng() * km, rng() * Math.PI * 2);

// ---------------------------------------------------------------- Solar ----
interface SolarArraySpec { name: string; site: string; capacityKwp: number; salt: number }

export function solarMonitoring(assets: UserAsset[] = []): SolarMonitor {
  const base = stable(0x501a2);
  const live = livey(0x501a2);
  const fromAssets = assets.length > 0;

  let arrays: SolarArraySpec[];
  if (fromAssets) {
    arrays = assets.map((a) => ({ name: a.name, site: a.site, capacityKwp: a.capacity_kw, salt: hashStr(a.id) }));
  } else {
    const total = 40 + Math.floor(base() * 460); // 40–500 kWp
    const invCount = 2 + Math.floor(base() * 4); // 2–5
    arrays = Array.from({ length: invCount }).map((_, i) => ({
      name: `Inverter ${i + 1}`,
      site: SITES[(i + 1) % SITES.length].name,
      capacityKwp: r(total / invCount, 1),
      salt: (i + 1) * 0x51a7,
    }));
  }
  const capacityKwp = r(arrays.reduce((s, a) => s + a.capacityKwp, 0), 1);
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

  const inverters: SolarInverter[] = arrays.map((arr, i) => {
    const vr = mulberry32((currentSeed() ^ arr.salt) >>> 0);
    // Some arrays are dirty or shaded and run below what the weather allows.
    const soiled = vr() < 0.25;
    const soiling = soiled ? 0.8 + vr() * 0.06 : 0.97 + vr() * 0.03;
    const roll = mulberry32((currentSeed() ^ arr.salt ^ (hourBucket() * 0x2f1)) >>> 0)();
    const status: SolarInverter["status"] = i === 0 && roll < 0.12 ? "warning" : roll < 0.04 ? "offline" : "online";
    const expectedKw = r(arr.capacityKwp * sf * weather);
    const ac = status === "offline" ? 0 : r(expectedKw * soiling);
    const faultCode = status === "offline" ? "GridMonitoring" : status === "warning" ? "DcIsoLow" : null;
    const strN = 1 + Math.floor(vr() * 2);
    return {
      id: `INV-${String(i + 1).padStart(2, "0")}`,
      name: arr.name,
      site: arr.site,
      location: near(siteLocation(arr.site), vr, 0.15),
      capacityKwp: arr.capacityKwp,
      status,
      acPowerKw: ac,
      expectedKw,
      // vs what this weather should give; the array's long-run figure at night
      performancePct: expectedKw > 0.5 ? r((ac / expectedKw) * 100, 0) : r(soiling * 100, 0),
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
    source: fromAssets ? "assets" : "demo",
    currentGenerationKw, capacityKwp, energyTodayKwh, energyMonthKwh, energyLifetimeKwh,
    selfConsumedKwh, exportedKwh, selfConsumedPct, exportedPct, specificYield,
    performanceRatioPct, exportEarningsTodayGbp, exportEarningsMonthGbp, co2AvoidedKg,
    inverters, curve, faults,
  };
}

// -------------------------------------------------------------- Battery ----
interface BatterySpec { name: string; site: string; capacityKwh: number; powerKw: number; salt: number }

export function batteryMonitoring(assets: UserAsset[] = []): BatteryMonitor {
  const base = stable(0xba77e);
  const live = livey(0xba77e);
  const fromAssets = assets.length > 0;

  let specs: BatterySpec[];
  if (fromAssets) {
    specs = assets.map((a) => {
      const kwh = Number(a.specs?.capacityKwh);
      return {
        name: a.name, site: a.site,
        // Without a stated storage capacity, assume a typical 2-hour system.
        capacityKwh: Number.isFinite(kwh) && kwh > 0 ? kwh : a.capacity_kw * 2,
        powerKw: a.capacity_kw, salt: hashStr(a.id),
      };
    });
  } else {
    const unitCount = 1 + Math.floor(base() * 3); // 1–3
    const perUnitKwh = pick(base, [5, 10, 13.5, 16] as const);
    specs = Array.from({ length: unitCount }).map((_, i) => ({
      name: `Battery ${i + 1}`,
      site: SITES[(i + 2) % SITES.length].name,
      capacityKwh: perUnitKwh,
      powerKw: perUnitKwh * 0.5,
      salt: (i + 1) * 0x9137,
    }));
  }

  const totalCapacityKwh = r(specs.reduce((s, b) => s + b.capacityKwh, 0), 1);
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
  const maxPower = specs.reduce((s, b) => s + b.powerKw, 0);
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

  const units: BatteryUnit[] = specs.map((b, i) => {
    const vr = mulberry32((currentSeed() ^ b.salt) >>> 0);
    return {
      id: `BAT-${String(i + 1).padStart(2, "0")}`,
      name: b.name,
      site: b.site,
      location: near(siteLocation(b.site), vr, 0.15),
      socPct: clamp(r(avgSocPct + (vr() * 8 - 4), 0), backupReservePct, 100),
      powerKw: r(maxPower ? (netPowerKw * b.powerKw) / maxPower : 0, 1),
      mode: operatingMode,
      ...(() => {
        const warn = vr() < 0.12;
        return { status: (warn ? "warning" : "online") as BatteryUnit["status"], temperatureC: r(warn ? 41 + vr() * 5 : 22 + vr() * 8, 0) };
      })(),
      healthPct: r(healthPct - vr() * 4, 0),
      cycles: Math.round(totalCycles / specs.length + vr() * 60),
      capacityKwh: b.capacityKwh,
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
    source: fromAssets ? "assets" : "demo",
    avgSocPct, netPowerKw, flow, backupReservePct, operatingMode,
    gridStatus: "connected", usableCapacityKwh, totalCapacityKwh, healthPct,
    totalCycles, throughputTodayKwh, savingsTodayGbp, savingsMonthGbp, units, curve,
  };
}

// ---------------------------------------------------------------- Fleet ----
const DEMO_MODELS: { name: string; kind: VehicleKind; batteryKwh: number; rangeMiles: number }[] = [
  { name: "eVanta 350", kind: "van", batteryKwh: 75, rangeMiles: 205 },
  { name: "Voltrix LCV", kind: "van", batteryKwh: 68, rangeMiles: 180 },
  { name: "Ampere Cargo", kind: "van", batteryKwh: 89, rangeMiles: 240 },
  { name: "Nova E-Transit", kind: "van", batteryKwh: 68, rangeMiles: 196 },
  { name: "Kestrel EV Estate", kind: "car", batteryKwh: 77, rangeMiles: 290 },
  { name: "Ionic Fleet Saloon", kind: "car", batteryKwh: 64, rangeMiles: 260 },
  { name: "MetroLink E12", kind: "bus", batteryKwh: 350, rangeMiles: 190 },
  { name: "Hauler E-26", kind: "truck", batteryKwh: 540, rangeMiles: 220 },
];
/** Typical miles per kWh, used when a registered vehicle has no stated range. */
const MILES_PER_KWH: Record<VehicleKind, number> = { car: 3.6, van: 2.7, bus: 0.55, truck: 0.45 };
/** Typical depot charging rate by vehicle type, kW. */
const DEPOT_CHARGE_KW: Record<VehicleKind, number> = { car: 11, van: 11, bus: 80, truck: 120 };
const TYRE_TARGET: Record<VehicleKind, number> = { car: 36, van: 55, bus: 120, truck: 110 };
const TYRES: { component: VehicleComponent; key: keyof VehicleDiagnostics["tyrePsi"]; label: string }[] = [
  { component: "tyre_fl", key: "fl", label: "front left" },
  { component: "tyre_fr", key: "fr", label: "front right" },
  { component: "tyre_rl", key: "rl", label: "rear left" },
  { component: "tyre_rr", key: "rr", label: "rear right" },
];

interface FaultTemplate {
  code: string;
  title: string;
  component: VehicleComponent | "tyre";
  severity: FaultSeverity;
  detail: string;
  action: string;
}
// Illustrative fault codes in the OBD-II style (P = powertrain, B = body,
// C = chassis, U = network). Demo data only.
const FAULTS: FaultTemplate[] = [
  { code: "P0AA6", title: "High-voltage isolation fault", component: "battery", severity: "critical",
    detail: "Isolation resistance between the high-voltage system and the chassis dropped below 500 Ω/V.",
    action: "Take the vehicle off the road. A high-voltage-qualified technician must inspect it before it is driven or charged." },
  { code: "P0D27", title: "Onboard charger fault", component: "onboard_charger", severity: "critical",
    detail: "The onboard charger stopped mid-session twice in 24 hours; AC charging is unavailable.",
    action: "Charge on DC only and book an onboard charger inspection." },
  { code: "P0A80", title: "Battery cell imbalance", component: "battery", severity: "warning",
    detail: "Cell group 14 is 42 mV below the pack average.",
    action: "Run a balancing charge to 100% overnight. Book a battery health check if it persists." },
  { code: "P0A2F", title: "Drive motor over-temperature", component: "motor", severity: "warning",
    detail: "Motor reached 128 °C on the last trip; power was limited for 6 minutes.",
    action: "Check the motor coolant level and pump. Avoid heavy loads until inspected." },
  { code: "P0C73", title: "Coolant pump performance", component: "cooling", severity: "warning",
    detail: "Battery coolant flow is 30% below target; pack temperature is running high.",
    action: "Inspect the coolant pump and lines at the next depot visit." },
  { code: "B1C1A", title: "Charge port lock fault", component: "charge_port", severity: "warning",
    detail: "The connector lock failed to engage on 3 of the last 5 plug-ins, so charging may stop.",
    action: "Clean the charge port and test the lock actuator; replace it if the fault returns." },
  { code: "U3003", title: "12V battery low voltage", component: "aux_battery", severity: "warning",
    detail: "Auxiliary 12V battery at 11.6 V; the vehicle may fail to wake.",
    action: "Leave the vehicle plugged in (it tops up the 12V battery) and test the 12V battery." },
  { code: "C0750", title: "Low tyre pressure", component: "tyre", severity: "warning",
    detail: "", action: "Inflate to the recommended pressure and check for a puncture." },
  { code: "C1A00", title: "Brake pad wear", component: "brakes", severity: "info",
    detail: "Front pads at 2.5 mm (replace at 3 mm).",
    action: "Book a brake service within the next 500 miles." },
  { code: "B10A2", title: "Cabin heat pump fault", component: "hvac", severity: "info",
    detail: "The heat pump is unavailable; the cabin heats with the resistive heater, reducing range by about 8%.",
    action: "Book an HVAC check. Pre-condition the cabin while plugged in to protect range." },
  { code: "U0198", title: "Telematics unit connection lost", component: "telematics", severity: "info",
    detail: "The telematics module missed 4 check-ins; location and charge data may be delayed.",
    action: "Power-cycle the vehicle. If it continues, check the telematics SIM and antenna." },
];
const CRITICAL = FAULTS.filter((f) => f.severity === "critical");
const NON_CRITICAL = FAULTS.filter((f) => f.severity !== "critical");

/** Local minutes since midnight. */
function minutesOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
function hhmm(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface DutyCycleInput {
  nowMin: number;
  depMin: number;
  shiftMin: number;
  worksToday: boolean;
  useFrac: number;
  plugsIn: boolean;
  startSoc: number;
  chargeKw: number;
  batteryKwh: number;
}
export interface DutyCycleState {
  soc: number;
  onRoad: boolean;
  /** 0–1 through today's shift (0 when not on the road). */
  progress: number;
  /** On the road but parked up (start/end of the run). */
  stopped: boolean;
  pluggedIn: boolean;
  charging: boolean;
  socAtNextDeparture: number;
}

/** A vehicle's day: it leaves at depMin with startSoc, drains useFrac of its
 * battery over the shift, returns, and (if it plugs in) charges at chargeKw
 * from 15 minutes after it gets back until full. Pure, so forecasting and
 * tests can reason about it. Times are minutes of the day. */
export function dutyCycle(c: DutyCycleInput): DutyCycleState {
  const retMin = c.depMin + c.shiftMin;
  const endSoc = c.worksToday ? Math.max(4, c.startSoc - c.useFrac * 100) : c.startSoc;
  const pctPerMin = (c.chargeKw / c.batteryKwh) * (100 / 60);
  const charged = (from: number, mins: number) => (c.plugsIn ? Math.min(100, from + Math.max(0, mins - 15) * pctPerMin) : from);
  const untilDeparture = (t: number) => ((c.depMin - t) % 1440 + 1440) % 1440;

  if (c.worksToday && c.nowMin >= c.depMin && c.nowMin < retMin) {
    const progress = (c.nowMin - c.depMin) / c.shiftMin;
    const soc = c.startSoc - c.useFrac * 100 * progress;
    return {
      soc, onRoad: true, progress, stopped: progress < 0.03 || progress > 0.97,
      pluggedIn: false, charging: false,
      socAtNextDeparture: charged(endSoc, 1440 - c.shiftMin),
    };
  }
  // Back at the depot: after today's return, or early morning before leaving
  // (still on yesterday's evening charge).
  const sinceReturn = c.nowMin >= retMin ? c.nowMin - retMin : c.nowMin + 1440 - retMin;
  const soc = charged(endSoc, sinceReturn);
  return {
    soc, onRoad: false, progress: 0, stopped: false,
    pluggedIn: c.plugsIn,
    charging: c.plugsIn && soc < 100 && sinceReturn > 15,
    socAtNextDeparture: charged(soc, untilDeparture(c.nowMin) + 15),
  };
}

interface VehicleSeed {
  name: string;
  kind: VehicleKind;
  batteryKwh: number;
  fullRange: number;
  /** Depot charging rate the vehicle actually gets, kW. */
  chargeKw: number;
  depot: string;
  reg?: string;
  driverId?: string;
  assetId?: string;
  salt: number;
}

function buildVehicle(i: number, seed: VehicleSeed, driverPool: number): FleetVehicle {
  const vr = mulberry32((currentSeed() ^ seed.salt) >>> 0);
  const lv = mulberry32((currentSeed() ^ seed.salt ^ (tick() * 101)) >>> 0);
  // Duty cycle — drawn first and in a fixed order (see below).
  const worksToday = vr() > 0.12;
  const shiftMin = 360 + Math.floor(vr() * 240); // 6–10 h on the road
  const useFrac = 0.3 + vr() * 0.4; // share of the battery a shift uses
  const plugsIn = vr() < 0.82; // plugged in back at the depot?
  const unpluggedStartSoc = 35 + vr() * 35;
  const letters = Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(vr() * 26)));
  const regDigits = 10 + Math.floor(vr() * 70);
  const odometerMiles = 8000 + Math.floor(vr() * 62000);
  const batteryHealthPct = r(90 + vr() * 9, 0);
  const depHour = 6 + Math.floor(vr() * 3);
  const depHalf = vr() < 0.5;
  const effFactor = 0.9 + vr() * 0.2;
  const tripRoll = vr();
  const bearing = vr() * Math.PI * 2;
  const routeStart = vr() * 9;
  const parkKm = vr() * 0.12;
  const parkBearing = vr() * Math.PI * 2;

  // Faults are stable per vehicle (vr, not lv) so they don't flicker.
  const faults: VehicleFault[] = [];
  const target = TYRE_TARGET[seed.kind];
  const tyrePsi = { fl: target, fr: target, rl: target, rr: target };
  for (const k of Object.keys(tyrePsi) as (keyof typeof tyrePsi)[]) tyrePsi[k] = r(target - 1 + vr() * 2, 0);
  const diagnostics: VehicleDiagnostics = {
    batteryTempC: r(22 + vr() * 8, 0),
    motorTempC: r(45 + vr() * 25, 0),
    cabinTempC: r(18 + vr() * 4, 0),
    auxBatteryV: r(12.4 + vr() * 0.3, 1),
    tyrePsi,
    tyreTargetPsi: target,
    brakePadMm: r(6 + vr() * 5, 1),
  };
  const addFault = (t: FaultTemplate) => {
    let component = t.component;
    let detail = t.detail;
    if (t.component === "tyre") {
      const tyre = pick(vr, TYRES);
      component = tyre.component;
      diagnostics.tyrePsi[tyre.key] = target - Math.max(6, Math.round(target * 0.18));
      detail = `The ${tyre.label} tyre is at ${diagnostics.tyrePsi[tyre.key]} psi (target ${target} psi) and has lost 4 psi in 24 hours.`;
    }
    if (t.component === "aux_battery") diagnostics.auxBatteryV = 11.6;
    if (t.component === "motor") diagnostics.motorTempC = 128;
    if (t.component === "cooling") diagnostics.batteryTempC = 41;
    if (t.component === "brakes") diagnostics.brakePadMm = 2.5;
    if (t.component === "hvac") diagnostics.cabinTempC = 14;
    if (faults.some((f) => f.code === t.code)) return;
    faults.push({
      code: t.code, title: t.title, component: component as VehicleComponent, severity: t.severity,
      detail, action: t.action,
      firstSeen: new Date(Date.now() - Math.floor((1 + vr() * 70) * 3600_000)).toISOString(),
    });
  };
  const roll = vr();
  if (roll < 0.09) addFault(pick(vr, CRITICAL));
  if (roll < 0.09 || roll > 0.62) {
    addFault(pick(vr, NON_CRITICAL));
    if (vr() < 0.3) addFault(pick(vr, NON_CRITICAL));
  }

  const critical = faults.some((f) => f.severity === "critical");
  const depMin = depHour * 60 + (depHalf ? 0 : 30);
  const cycle = dutyCycle({
    nowMin: minutesOfDay(), depMin, shiftMin, worksToday: worksToday && !critical, useFrac, plugsIn,
    startSoc: plugsIn ? 97 : unpluggedStartSoc, chargeKw: seed.chargeKw, batteryKwh: seed.batteryKwh,
  });
  const socPct = clamp(r(cycle.soc + (lv() - 0.5), 0), 3, 100);
  const rangeMiles = Math.round((socPct / 100) * seed.fullRange);
  const neededSocPct = Math.min(100, Math.round(useFrac * 100 + 12)); // next shift + 12% buffer

  let status: FleetStatus = "idle";
  if (critical) status = "fault";
  else if (cycle.onRoad) status = "in_use";
  else if (cycle.charging) status = "charging";
  else if (socPct >= neededSocPct) status = "ready";

  const depotLoc = siteLocation(seed.depot);
  const onRoad = status === "in_use";
  const privateTrip = onRoad && tripRoll < 0.2;
  // On the road: out along a stable bearing and back over the shift.
  const position = privateTrip
    ? null
    : onRoad
      ? offset(depotLoc, 1 + (4 + routeStart) * Math.sin(Math.PI * cycle.progress), bearing)
      : offset(depotLoc, parkKm, parkBearing);
  const scheduledDeparture = hhmm(depMin);
  const socAtDeparturePct = Math.round(cycle.socAtNextDeparture);
  const readyByDeparture = !critical && socAtDeparturePct >= neededSocPct;
  const eff = r((seed.batteryKwh / seed.fullRange) * effFactor, 2); // kWh/mile

  return {
    id: `VH-${String(i + 1).padStart(3, "0")}`,
    name: seed.name,
    kind: seed.kind,
    ...(seed.assetId ? { assetId: seed.assetId } : {}),
    batteryKwh: seed.batteryKwh,
    depot: seed.depot,
    position,
    privateTrip,
    speedMph: onRoad && !cycle.stopped ? Math.round(12 + lv() * 38) : 0,
    faults,
    diagnostics,
    reg: seed.reg ?? `${letters[0]}${letters[1]}${regDigits} ${letters[2]}${letters[3]}${letters[4]}`,
    driverId: seed.driverId ?? `DRV-${100 + (i % driverPool)}`,
    socPct,
    rangeMiles,
    pluggedIn: cycle.pluggedIn,
    charging: cycle.charging,
    status,
    locationArea: privateTrip ? "Private trip (location hidden)" : onRoad ? `On route near ${seed.depot}` : seed.depot,
    lastSeenMins: Math.floor(lv() * (onRoad ? 3 : 45)),
    odometerMiles,
    efficiencyKwhPerMile: eff,
    milesPerKwh: r(1 / eff, 2),
    costPerMileGbp: r(eff * 0.28, 2),
    batteryHealthPct,
    readyByDeparture,
    scheduledDeparture,
    returnTime: hhmm(depMin + shiftMin),
    worksToday: worksToday && !critical,
    chargeRateKw: seed.chargeKw,
    shiftUseKwh: r(useFrac * seed.batteryKwh, 1),
    neededSocPct,
    socAtDeparturePct,
  };
}

export function fleetMonitoring(assets: UserAsset[] = []): FleetMonitor {
  const base = stable(0xf1ee7);
  const fromAssets = assets.length > 0;
  const driverPool = 2 + Math.floor(base() * 4); // 2–5 drivers

  let seeds: VehicleSeed[];
  if (fromAssets) {
    seeds = assets.map((a) => {
      const battery = Number(a.specs?.batteryKwh);
      const range = Number(a.specs?.rangeMiles);
      const batteryKwh = Number.isFinite(battery) && battery > 0 ? battery : 75;
      const kind = vehicleKindOf(a.specs);
      return {
        name: a.name,
        kind,
        batteryKwh,
        fullRange: Number.isFinite(range) && range > 0 ? range : Math.round(batteryKwh * MILES_PER_KWH[kind]),
        depot: a.site,
        chargeKw: clamp(a.capacity_kw, 2, 350),
        reg: a.specs?.reg ? String(a.specs.reg) : undefined,
        driverId: a.specs?.driver ? String(a.specs.driver) : undefined,
        assetId: a.id,
        salt: hashStr(a.id),
      };
    });
  } else {
    const n = 6 + Math.floor(base() * 7); // 6–12
    seeds = Array.from({ length: n }).map((_, i) => {
      const salt = (i + 1) * 0x9e3779b1;
      const vr = mulberry32((currentSeed() ^ salt) >>> 0);
      // Always include at least one car, bus and truck in a demo fleet.
      const model = i === 1 ? DEMO_MODELS[4] : i === 3 ? DEMO_MODELS[6] : i === 5 ? DEMO_MODELS[7] : pick(vr, DEMO_MODELS);
      return {
        name: model.name, kind: model.kind, batteryKwh: model.batteryKwh,
        fullRange: Math.round(model.rangeMiles * (0.92 + vr() * 0.12)),
        chargeKw: DEPOT_CHARGE_KW[model.kind],
        depot: SITES[Math.floor(vr() * SITES.length)].name,
        salt,
      };
    });
  }

  const vehicles = seeds.map((s, i) => buildVehicle(i, s, driverPool));

  const n = vehicles.length;
  const avg = (f: (v: FleetVehicle) => number, d = 0) => r(vehicles.reduce((s, v) => s + f(v), 0) / n, d);
  const faultCounts: Record<FaultSeverity, number> = { critical: 0, warning: 0, info: 0 };
  for (const v of vehicles) for (const f of v.faults) faultCounts[f.severity] += 1;

  const byDriver = new Map<string, DriverReimbursement>();
  for (const v of vehicles) {
    const dvr = mulberry32((currentSeed() ^ hashStr(v.driverId) ^ hashStr(v.id)) >>> 0);
    const kwh = r(6 + dvr() * 22, 1);
    const entry = byDriver.get(v.driverId) ?? { driverId: v.driverId, homeEnergyKwh: 0, reimbursementGbp: 0, sessions: 0 };
    entry.homeEnergyKwh = r(entry.homeEnergyKwh + kwh, 1);
    entry.reimbursementGbp = r(entry.reimbursementGbp + kwh * 0.29, 2);
    entry.sessions += 1 + Math.floor(dvr() * 3);
    byDriver.set(v.driverId, entry);
  }

  const depotNames = Array.from(new Set(vehicles.map((v) => v.depot)));

  return {
    asOf: nowIso(),
    source: fromAssets ? "assets" : "demo",
    depots: depotNames.map((name) => ({ name, location: siteLocation(name) })),
    faultCounts,
    totalVehicles: n,
    readyCount: vehicles.filter((v) => v.readyByDeparture).length,
    pluggedInCount: vehicles.filter((v) => v.pluggedIn).length,
    chargingCount: vehicles.filter((v) => v.charging).length,
    avgSocPct: avg((v) => v.socPct),
    avgEfficiencyMiPerKwh: avg((v) => v.milesPerKwh, 2),
    avgCostPerMileGbp: avg((v) => v.costPerMileGbp, 2),
    fleetHealthPct: avg((v) => v.batteryHealthPct),
    vehicles,
    reimbursements: Array.from(byDriver.values()).sort((a, b) => a.driverId.localeCompare(b.driverId)),
  };
}
