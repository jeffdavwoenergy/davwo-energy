/**
 * Synthetic data provider (TS port of the old data_simulator.py).
 * Phase 2 overlays real public-API values (carbon, pricing, weather, charge points)
 * onto these exact shapes behind the same route handlers.
 */

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const nowHour = () => new Date().getUTCHours();

function demandCurve(hour: number): number {
  const base = 4 + 2 * Math.sin(((hour - 6) / 24) * 2 * Math.PI);
  const morning = 3 * Math.exp(-((hour - 8) ** 2) / 6);
  const evening = 9 * Math.exp(-((hour - 19) ** 2) / 4);
  return Math.max(1, base + morning + evening) + rand(-0.4, 0.4);
}

export function headlineKpis() {
  const h = nowHour();
  const energy = round(demandCurve(h) + 6, 1);
  const inProgress = randint(38, 55);
  const completed = randint(22, 32);
  const scheduled = randint(6, 14);
  return {
    active_chargers: 145 + randint(-3, 4),
    charging_sessions: inProgress + completed + scheduled,
    sessions_breakdown: { in_progress: inProgress, completed, scheduled },
    connected_vehicles: 112 + randint(-5, 6),
    energy_consumption_mwh: energy,
    average_cost_per_kwh: round(0.18 + rand(-0.01, 0.01), 3),
    ani_status: "Active",
    infrastructure_status: "Healthy",
    forecast_confidence_pct: 87 + randint(-2, 3),
    infrastructure_health: { excellent: 122, good: 18, attention: 5, critical: 0 },
    today_summary: {
      total_revenue_gbp: 4230 + randint(-80, 120),
      total_energy_mwh: energy,
      cost_savings_gbp: 1240 + randint(-40, 60),
      co2_avoided_tco2: round(2.8 + rand(-0.1, 0.2), 2),
    },
    system_overview: {
      network_health_pct: 98,
      operational_efficiency_pct: 92,
      forecast_accuracy_pct: 89,
      system_availability_pct: 99.9,
    },
    vs_yesterday: {
      active_chargers: 12,
      charging_sessions: 8,
      connected_vehicles: 10,
      energy_consumption: 14,
      average_cost: -3,
      total_revenue: 9,
      total_energy: 14,
      cost_savings: 12,
      co2_avoided: 10,
    },
    data_mode: "synthetic" as const,
    data_sources: ["synthetic"],
    timestamp: new Date().toISOString(),
  };
}

export type EnergyPoint = { time: string; value: number };

export function energySeries(period: "day" | "week" | "month" = "day"): EnergyPoint[] {
  if (period === "week") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((d, i) => ({ time: d, value: round(10 + rand(-2, 6) + i * 0.4, 1) }));
  }
  if (period === "month") {
    return Array.from({ length: 4 }, (_, i) => ({
      time: `W${i + 1}`,
      value: round(60 + rand(-8, 14) + i * 1.5, 1),
    }));
  }
  return Array.from({ length: 25 }, (_, h) => ({
    time: `${String(h).padStart(2, "0")}:00`,
    value: round(demandCurve(h), 2),
  }));
}

export function assetTypeBreakdown() {
  return [
    { name: "EV Chargers", value: 7.1, share: 56 },
    { name: "Energy Storage", value: 3.2, share: 25 },
    { name: "Solar Assets", value: 1.6, share: 13 },
    { name: "Other Assets", value: 0.6, share: 6 },
  ];
}

export function costBreakdown() {
  return [
    { name: "Electricity", value: 6240, share: 50 },
    { name: "Demand Charges", value: 2480, share: 20 },
    { name: "Maintenance", value: 1870, share: 15 },
    { name: "Other Costs", value: 1860, share: 15 },
  ];
}

export function recommendation() {
  return {
    title: "ANI™ Recommendation",
    detail: "ANI™ has detected an increase in charging demand between 18:00 – 21:00.",
    action: "Shift non-priority charging to off-peak periods.",
    estimated_savings_gbp: 2400,
    confidence_pct: 89,
  };
}

export function mapPins() {
  const sites: Array<[string, number, number, string]> = [
    ["London", 51.507, -0.087, "operational"],
    ["Manchester", 53.479, -2.245, "operational"],
    ["Birmingham", 52.479, -1.902, "warning"],
    ["Edinburgh", 55.928, -3.298, "operational"],
    ["Bristol", 51.453, -2.587, "critical"],
    ["Leeds", 53.801, -1.548, "operational"],
    ["Glasgow", 55.864, -4.252, "operational"],
    ["Liverpool", 53.408, -2.991, "operational"],
  ];
  return sites.map(([site, lat, lng, status]) => ({
    site,
    lat,
    lng,
    status,
    active_sessions: randint(3, 18),
  }));
}

export type Alert = {
  id: string;
  severity: "high" | "medium" | "low";
  status: "active" | "acknowledged" | "resolved";
  title: string;
  asset: string;
  site: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
};

export function alerts(): Alert[] {
  const mk = (
    id: string,
    severity: Alert["severity"],
    title: string,
    asset: string,
    site: string,
    minsAgo: number,
  ): Alert => ({
    id,
    severity,
    status: "active",
    title,
    asset,
    site,
    created_at: new Date(Date.now() - minsAgo * 60_000).toISOString(),
  });
  return [
    mk("al-1", "high", "Peak demand approaching capacity", "Rapid Charger Cluster", "Bristol", 12),
    mk("al-2", "medium", "Recurring fault on Port B", "Central Depot / Port B", "Birmingham", 48),
    mk("al-3", "medium", "Maintenance due within 7 days", "Battery Bank 2", "Manchester", 95),
    mk("al-4", "low", "Underutilised site this week", "Riverside Point", "Leeds", 180),
  ];
}
