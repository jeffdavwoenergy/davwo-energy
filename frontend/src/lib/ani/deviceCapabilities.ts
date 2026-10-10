// Ask ANI™ capabilities for the Solar, Battery and Fleet device types. Same
// contract as the EV/grid capabilities in assistant.ts: keyword-routed, and
// every number comes from the org's device simulations (never an LLM).

import type { Block } from "./blocks";
import { currentOrg } from "@/lib/server/context";
import { priceSlots } from "@/lib/server/providers";
import {
  deviceMonitors, solarInsights, batteryInsights, type DeviceInsight,
} from "@/lib/server/deviceInsights";
import { fleetForecast, batteryForecast } from "@/lib/server/deviceForecast";

export type DeviceId = "solar" | "battery" | "fleet";

export interface DeviceCapability {
  id: string;
  label: string;
  device: DeviceId;
  keywords: string[];
  build: () => Promise<Block[]>;
}

const SEV = { critical: "high", warning: "medium", info: "low" } as const;
const insightBlock = (i: DeviceInsight): Block => ({ type: "insight", severity: i.severity, title: i.asset, detail: i.why, recommendation: i.recommendation });
async function spread(): Promise<{ pence: number; slots: Awaited<ReturnType<typeof priceSlots>> }> {
  const slots = await priceSlots(currentOrg()).catch(() => null);
  if (!slots?.length) return { pence: 12, slots: null };
  const p = slots.map((s) => s.pence);
  return { pence: Math.max(...p) - Math.min(...p), slots };
}

export const DEVICE_CAPABILITIES: DeviceCapability[] = [
  {
    id: "fleet_status",
    label: "fleet readiness",
    device: "fleet",
    keywords: ["fleet", "vehicle", "van", "bus", "truck", "car", "driver", "ready", "departure", "range", "doing", "status", "where"],
    build: async () => {
      const { fleet: f } = await deviceMonitors(currentOrg());
      const onRoad = f.vehicles.filter((v) => v.status === "in_use").length;
      const atRisk = f.vehicles.filter((v) => !v.readyByDeparture);
      const blocks: Block[] = [
        {
          type: "kpis",
          items: [
            { label: "On the road", value: `${onRoad}/${f.totalVehicles}` },
            { label: "Ready by departure", value: `${f.readyCount}/${f.totalVehicles}` },
            { label: "Faults to fix", value: f.faultCounts.critical + f.faultCounts.warning },
            { label: "Average charge", value: f.avgSocPct, unit: "%" },
          ],
        },
      ];
      if (atRisk.length) {
        blocks.push({
          type: "table",
          title: "Won't be ready for their next run",
          columns: ["Vehicle", "Reg", "Leaves", "Projected", "Needs"],
          rows: atRisk.map((v) => [v.name, v.reg, v.scheduledDeparture, `${v.socAtDeparturePct}%`, v.status === "fault" ? "Off road" : `${v.neededSocPct}%`]),
        });
      } else {
        blocks.push({ type: "text", text: "Every vehicle is on course to have enough charge for its next run." });
      }
      return blocks;
    },
  },
  {
    id: "fleet_faults",
    label: "vehicle faults",
    device: "fleet",
    keywords: ["fault", "wrong", "broken", "repair", "maintenance", "attention", "problem", "issue", "service", "brake", "tyre", "tire", "warning"],
    build: async () => {
      const { fleet: f } = await deviceMonitors(currentOrg());
      const faults = f.vehicles
        .flatMap((v) => v.faults.map((x) => ({ v, x })))
        .sort((a, b) => ["critical", "warning", "info"].indexOf(a.x.severity) - ["critical", "warning", "info"].indexOf(b.x.severity));
      if (!faults.length) return [{ type: "text", text: "No open faults on any vehicle — the whole fleet is healthy." }];
      return faults.slice(0, 6).map(({ v, x }): Block => ({
        type: "insight", severity: SEV[x.severity], title: `${v.name} (${v.reg}) — ${x.title} · ${x.code}`, detail: x.detail, recommendation: x.action,
      }));
    },
  },
  {
    id: "fleet_plan",
    label: "tonight's charging plan",
    device: "fleet",
    keywords: ["charge", "charging", "tonight", "overnight", "plan", "cheapest", "schedule", "depot", "cost", "saving", "save"],
    build: async () => {
      const [{ fleet: f }, { slots }] = await Promise.all([deviceMonitors(currentOrg()), spread()]);
      const fc = fleetForecast(f, null, slots);
      return [
        {
          type: "kpis",
          items: [
            { label: "To charge tonight", value: Math.round(fc.totals.energyKwh), unit: "kWh" },
            { label: "Smart charging cost", value: `£${fc.totals.costSmartGbp.toFixed(2)}`, live: fc.priceSource === "live" },
            { label: "Saved vs on arrival", value: `£${fc.totals.savingGbp.toFixed(2)}`, live: fc.priceSource === "live" },
          ],
        },
        {
          type: "table",
          title: "Charging plan",
          columns: ["Vehicle", "Depot", "Charge", "kWh", "Cost"],
          rows: fc.plan.map((p) => [`${p.name} (${p.reg})`, p.depot, p.start ? `${p.start}–${p.end}` : "Won't fit", Math.round(p.energyKwh), `£${p.costSmartGbp.toFixed(2)}`]),
        },
      ];
    },
  },
  {
    id: "solar_status",
    label: "solar performance",
    device: "solar",
    keywords: ["solar", "panel", "array", "inverter", "generating", "generation", "pv", "sun", "export", "doing", "status", "attention", "fault", "dirty", "clean", "wrong"],
    build: async () => {
      const { solar: s } = await deviceMonitors(currentOrg());
      return [
        {
          type: "kpis",
          items: [
            { label: "Generating now", value: s.currentGenerationKw, unit: "kW" },
            { label: "Today", value: s.energyTodayKwh, unit: "kWh" },
            { label: "Used on site", value: s.selfConsumedPct, unit: "%" },
            { label: "Export earnings today", value: `£${s.exportEarningsTodayGbp.toFixed(2)}` },
          ],
        },
        {
          type: "table",
          title: "Arrays",
          columns: ["Array", "Site", "Output", "vs expected", "Status"],
          rows: s.inverters.map((i) => [i.name, i.site, `${i.acPowerKw} kW`, `${i.performancePct}%`, i.status]),
        },
        ...solarInsights(s).map(insightBlock),
      ];
    },
  },
  {
    id: "battery_status",
    label: "battery status and plan",
    device: "battery",
    keywords: ["battery", "batteries", "storage", "stored", "soc", "backup", "reserve", "discharge", "charge", "saving", "save", "doing", "status", "attention", "plan", "tonight"],
    build: async () => {
      const [{ battery: b }, { pence, slots }] = await Promise.all([deviceMonitors(currentOrg()), spread()]);
      const plan = batteryForecast(b, slots);
      return [
        {
          type: "kpis",
          items: [
            { label: "Charge", value: b.avgSocPct, unit: "%" },
            { label: "Power now", value: b.netPowerKw, unit: "kW" },
            { label: "Saved today", value: `£${b.savingsTodayGbp.toFixed(2)}` },
            { label: "Health", value: b.healthPct, unit: "%" },
          ],
        },
        {
          type: "text",
          text: plan.chargeWindow
            ? `Next 24 hours: charge **${plan.chargeWindow}**, discharge **${plan.dischargeWindow ?? "—"}**, saving about **£${plan.savingGbp.toFixed(2)}**.`
            : "Prices are too flat over the next 24 hours for charging and discharging to pay — the battery will hold.",
        },
        ...batteryInsights(b, pence).map(insightBlock),
      ];
    },
  },
];

/** What a vague question means on each device's pages. */
export const DEVICE_DEFAULT: Record<DeviceId, string> = { fleet: "fleet_status", solar: "solar_status", battery: "battery_status" };
export const DEVICE_CONTEXT: Partial<Record<DeviceId, Record<string, string>>> = {
  fleet: { "/forecasting": "fleet_plan", "/alerts": "fleet_faults", "/monitoring": "fleet_faults" },
};

