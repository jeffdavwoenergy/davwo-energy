// Pure types shared by the server data generator and the client monitoring
// dashboards (keep runtime-free so client bundles don't pull in server code).

export interface SolarInverter {
  id: string;
  name: string;
  status: "online" | "warning" | "offline";
  acPowerKw: number;
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
  socPct: number;
  powerKw: number; // + charging, - discharging
  mode: BatteryMode;
  status: "online" | "warning" | "offline";
  healthPct: number;
  cycles: number;
  capacityKwh: number;
}
export interface BatteryPoint {
  t: string;
  soc: number;
  power: number;
}
export interface BatteryMonitor {
  asOf: string;
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
export interface FleetVehicle {
  id: string;
  name: string;
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
}
export interface DriverReimbursement {
  driverId: string;
  homeEnergyKwh: number;
  reimbursementGbp: number;
  sessions: number;
}
export interface FleetMonitor {
  asOf: string;
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
