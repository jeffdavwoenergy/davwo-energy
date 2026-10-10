// Pure types shared by the server data generator and the client monitoring
// dashboards (keep runtime-free so client bundles don't pull in server code).

import type { VehicleKind } from "@/lib/assetSpecs";
export type { VehicleKind };

export interface LatLng { lat: number; lng: number }
/** "demo" = seeded illustrative data; "assets" = built from the org's own
 * registered devices of this type (telemetry still simulated per device). */
export type MonitorSource = "demo" | "assets";

export interface SolarInverter {
  id: string;
  name: string;
  site: string;
  location: LatLng;
  capacityKwp: number;
  status: "online" | "warning" | "offline";
  acPowerKw: number;
  /** What this array should be producing in the current weather. */
  expectedKw: number;
  /** acPowerKw as a % of expectedKw — low means dirty, shaded or faulty. */
  performancePct: number;
  dcVoltage: number;
  temperatureC: number;
  faultCode: string | null;
  strings: { id: string; powerW: number; voltage: number }[];
}
export interface SolarFault {
  inverterId: string;
  name: string;
  code: string;
  detail: string;
  at: string;
}
export interface SolarPoint {
  t: string;
  actual: number;
  expected: number;
}
export interface SolarMonitor {
  asOf: string;
  source: MonitorSource;
  currentGenerationKw: number;
  capacityKwp: number;
  energyTodayKwh: number;
  energyMonthKwh: number;
  energyLifetimeKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  selfConsumedPct: number;
  exportedPct: number;
  specificYield: number;
  performanceRatioPct: number;
  exportEarningsTodayGbp: number;
  exportEarningsMonthGbp: number;
  co2AvoidedKg: number;
  inverters: SolarInverter[];
  curve: SolarPoint[];
  faults: SolarFault[];
}

export type BatteryMode = "self-powered" | "time-based" | "backup";
export interface BatteryUnit {
  id: string;
  name: string;
  site: string;
  location: LatLng;
  socPct: number;
  powerKw: number; // + charging, - discharging
  mode: BatteryMode;
  status: "online" | "warning" | "offline";
  healthPct: number;
  cycles: number;
  capacityKwh: number;
  temperatureC: number;
}
export interface BatteryPoint {
  t: string;
  soc: number;
  power: number;
}
export interface BatteryMonitor {
  asOf: string;
  source: MonitorSource;
  avgSocPct: number;
  netPowerKw: number;
  flow: "charging" | "discharging" | "idle";
  backupReservePct: number;
  operatingMode: BatteryMode;
  gridStatus: "connected" | "islanded";
  usableCapacityKwh: number;
  totalCapacityKwh: number;
  healthPct: number;
  totalCycles: number;
  throughputTodayKwh: number;
  savingsTodayGbp: number;
  savingsMonthGbp: number;
  units: BatteryUnit[];
  curve: BatteryPoint[];
}

export type FleetStatus = "ready" | "charging" | "in_use" | "idle" | "fault";

/** Where on the vehicle a fault sits — drives the hotspot on the cutaway. */
export type VehicleComponent =
  | "battery" | "motor" | "charge_port" | "onboard_charger"
  | "tyre_fl" | "tyre_fr" | "tyre_rl" | "tyre_rr"
  | "brakes" | "aux_battery" | "cooling" | "hvac" | "telematics";
export type FaultSeverity = "critical" | "warning" | "info";
export interface VehicleFault {
  code: string;
  title: string;
  component: VehicleComponent;
  severity: FaultSeverity;
  detail: string;
  action: string;
  firstSeen: string;
}
export interface VehicleDiagnostics {
  batteryTempC: number;
  motorTempC: number;
  cabinTempC: number;
  auxBatteryV: number;
  tyrePsi: { fl: number; fr: number; rl: number; rr: number };
  tyreTargetPsi: number;
  brakePadMm: number;
}

export interface FleetVehicle {
  id: string;
  name: string;
  kind: VehicleKind;
  /** Set when the vehicle comes from the org's asset register. */
  assetId?: string;
  batteryKwh: number;
  depot: string;
  /** null while on a private trip (location withheld for driver privacy). */
  position: LatLng | null;
  privateTrip: boolean;
  speedMph: number;
  faults: VehicleFault[];
  diagnostics: VehicleDiagnostics;
  reg: string;
  driverId: string;
  socPct: number;
  rangeMiles: number;
  pluggedIn: boolean;
  charging: boolean;
  status: FleetStatus;
  locationArea: string;
  lastSeenMins: number;
  odometerMiles: number;
  efficiencyKwhPerMile: number;
  milesPerKwh: number;
  costPerMileGbp: number;
  batteryHealthPct: number;
  readyByDeparture: boolean;
  scheduledDeparture: string;
  /** When today's shift ends (hh:mm). */
  returnTime: string;
  /** false = resting today (or off the road with a critical fault). */
  worksToday: boolean;
  chargeRateKw: number;
  /** Energy a typical shift uses, kWh. */
  shiftUseKwh: number;
  /** Charge needed for the next shift, incl. a safety buffer. */
  neededSocPct: number;
  /** Projected charge at the next scheduled departure. */
  socAtDeparturePct: number;
}
export interface DriverReimbursement {
  driverId: string;
  homeEnergyKwh: number;
  reimbursementGbp: number;
  sessions: number;
}
export interface FleetMonitor {
  asOf: string;
  source: MonitorSource;
  depots: { name: string; location: LatLng }[];
  faultCounts: Record<FaultSeverity, number>;
  totalVehicles: number;
  readyCount: number;
  pluggedInCount: number;
  chargingCount: number;
  avgSocPct: number;
  avgEfficiencyMiPerKwh: number;
  avgCostPerMileGbp: number;
  fleetHealthPct: number;
  vehicles: FleetVehicle[];
  reimbursements: DriverReimbursement[];
}
