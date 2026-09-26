import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/server/prisma";
import { listVendors, type VendorCategory } from "@/lib/server/marketplace";
import { listProducts } from "@/lib/server/products";

/**
 * Pilot onboarding brain. Turns an organisation's infrastructure profile into an
 * instant, populated workspace — insights, an ROI estimate, and matched
 * marketplace partners — so a new pilot never lands on an empty dashboard.
 * Fully deterministic (no LLM key needed); ANI narration can layer on later.
 */
export type Objective =
  | "cut-costs" | "reduce-carbon" | "improve-uptime" | "grow-revenue" | "compliance";

export const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "cut-costs", label: "Cut energy costs" },
  { id: "reduce-carbon", label: "Reduce carbon emissions" },
  { id: "improve-uptime", label: "Improve asset uptime & reliability" },
  { id: "grow-revenue", label: "Grow revenue from assets" },
  { id: "compliance", label: "Meet compliance & reporting (SECR/ESOS)" },
];

export interface InfraProfile {
  organisation: string;
  sector?: string;
  region?: string;
  evChargers: number;
  solarKw: number;
  batteryKwh: number;
  smartMeters: number;
  objectives: Objective[];
  challenges?: string;
}

export interface PilotInsight {
  severity: "opportunity" | "action" | "info";
  title: string;
  detail: string;
}
export interface RecommendedPartner {
  category: VendorCategory;
  categoryLabel: string;
  reason: string;
  vendor?: string;
  productId?: string;
  productName?: string;
}
export interface PilotWorkspace {
  id: string;
  organisation: string;
  createdAt: string;
  profileSummary: string;
  estimated: { annualSpendGbp: number; annualSavingGbp: number; annualCo2SavingT: number };
  insights: PilotInsight[];
  recommendedPartners: RecommendedPartner[];
  dataMode: "simulated";
}

const CAT_LABEL: Record<VendorCategory, string> = {
  "ev-chargers": "EV Chargers",
  battery: "Battery Solutions",
  solar: "Solar Solutions",
  "energy-services": "Energy Services",
  consulting: "Consulting Services",
};

const round = (n: number) => Math.round(n);

/** Rough but defensible ROI model for the profile (illustrative, labelled simulated). */
function estimate(p: InfraProfile) {
  // Per-charger throughput ~ 40 kWh/day; solar self-gen offsets import; smart shifting captures ~8p/kWh spread.
  const chargerKwhYr = p.evChargers * 40 * 365;
  const solarKwhYr = p.solarKw * 950; // UK ~950 kWh/kWp/yr
  const importKwhYr = Math.max(0, chargerKwhYr - solarKwhYr * 0.5);
  const price = 0.26;
  const annualSpendGbp = round(importKwhYr * price);
  const shiftable = p.evChargers > 0 ? 0.35 : 0.15;
  const spread = 0.08;
  const smartSaving = importKwhYr * shiftable * spread;
  const solarSaving = solarKwhYr * 0.5 * price;
  const batteryBoost = p.batteryKwh > 0 ? smartSaving * 0.25 : 0;
  const annualSavingGbp = round(smartSaving + solarSaving + batteryBoost);
  const gridCarbon = 233, cleanShift = 90; // gCO2/kWh baseline vs clean window
  const annualCo2SavingT = +(
    (importKwhYr * shiftable * (gridCarbon - cleanShift) + solarKwhYr * gridCarbon) / 1_000_000
  ).toFixed(1);
  return { annualSpendGbp, annualSavingGbp, annualCo2SavingT };
}

function buildInsights(p: InfraProfile, est: PilotWorkspace["estimated"]): PilotInsight[] {
  const out: PilotInsight[] = [];
  if (p.evChargers > 0) {
    out.push({
      severity: "opportunity",
      title: `Shift charging on your ${p.evChargers} charge point${p.evChargers > 1 ? "s" : ""} to the cheapest, cleanest window`,
      detail: `ANI™ projects ~£${est.annualSavingGbp.toLocaleString()}/yr saved and ${est.annualCo2SavingT} tCO₂ avoided by moving flexible load into the daily low-price, low-carbon half-hour it already tracks from live UK grid data.`,
    });
  }
  if (p.solarKw > 0 && p.batteryKwh === 0) {
    out.push({
      severity: "action",
      title: "Add storage to capture your solar generation",
      detail: `With ${p.solarKw} kW of solar and no battery, surplus generation is exported at low value. On-site storage would let ANI™ time-shift it into peak-price periods.`,
    });
  }
  if (p.smartMeters < Math.max(1, Math.ceil((p.evChargers + (p.solarKw > 0 ? 1 : 0)) / 2))) {
    out.push({
      severity: "info",
      title: "Metering coverage looks thin for full visibility",
      detail: "Half-hourly metering on each site unlocks accurate cost attribution and settlement — ANI™ can then benchmark performance per asset.",
    });
  }
  if (p.objectives.includes("compliance")) {
    out.push({
      severity: "info",
      title: "SECR/ESOS-ready reporting from day one",
      detail: "ANI™ will generate board-ready carbon and energy reports (PDF/CSV) automatically as your live data flows in.",
    });
  }
  if (p.objectives.includes("grow-revenue")) {
    out.push({
      severity: "opportunity",
      title: "Your flexibility could become a revenue stream",
      detail: "Aggregated flexible load can be enrolled in demand-response / flexibility markets — turning assets you already own into income.",
    });
  }
  return out.length ? out : [{
    severity: "info",
    title: "Workspace ready — connect assets to sharpen these insights",
    detail: "ANI™ has created your workspace with simulated data tuned to your profile. Connecting live assets will refine every figure automatically.",
  }];
}

/** Resolves each recommended category against a real, supplier-listed
 * marketplace product first (newest-first per listProducts), so "ANI
 * recommends battery storage" points at an actual listing a buyer can open
 * and enquire about — falling back to the curated static vendor profile
 * only for categories no real supplier has listed a product in yet. */
async function recommendPartners(p: InfraProfile): Promise<RecommendedPartner[]> {
  const wanted = new Set<VendorCategory>();
  const reasons: Partial<Record<VendorCategory, string>> = {};
  if (p.evChargers > 0) { wanted.add("ev-chargers"); reasons["ev-chargers"] = "Expand or upgrade your charge-point estate."; }
  if (p.solarKw > 0) { wanted.add("solar"); reasons.solar = "Optimise or extend your solar generation."; }
  if (p.batteryKwh > 0 || (p.solarKw > 0 && p.batteryKwh === 0)) { wanted.add("battery"); reasons.battery = "Storage to capture solar and shift load."; }
  if (p.objectives.includes("cut-costs") || p.objectives.includes("reduce-carbon")) { wanted.add("energy-services"); reasons["energy-services"] = "Metering, billing and flexibility-market access."; }
  if (p.objectives.includes("compliance") || p.objectives.includes("grow-revenue")) { wanted.add("consulting"); reasons.consulting = "Strategy, grid connection and compliance support."; }

  return Promise.all(
    [...wanted].map(async (cat) => {
      const base = { category: cat, categoryLabel: CAT_LABEL[cat], reason: reasons[cat] ?? "" };
      const [product] = await listProducts({ category: cat });
      if (product) return { ...base, productId: product.id, productName: product.name };
      const vendor = listVendors(cat).find((v) => v.verified) ?? listVendors(cat)[0];
      return { ...base, vendor: vendor?.name };
    }),
  );
}

function profileSummary(p: InfraProfile): string {
  const parts: string[] = [];
  if (p.evChargers) parts.push(`${p.evChargers} EV charge point${p.evChargers > 1 ? "s" : ""}`);
  if (p.solarKw) parts.push(`${p.solarKw} kW solar`);
  if (p.batteryKwh) parts.push(`${p.batteryKwh} kWh storage`);
  if (p.smartMeters) parts.push(`${p.smartMeters} smart meter${p.smartMeters > 1 ? "s" : ""}`);
  const assets = parts.length ? parts.join(", ") : "no assets registered yet";
  return `${p.organisation}${p.region ? ` (${p.region})` : ""} — ${assets}.`;
}

export async function buildWorkspace(p: InfraProfile): Promise<PilotWorkspace> {
  const estimated = estimate(p);
  return {
    id: `pilot-${randomUUID()}`,
    organisation: p.organisation,
    createdAt: new Date().toISOString(),
    profileSummary: profileSummary(p),
    estimated,
    insights: buildInsights(p, estimated),
    recommendedPartners: await recommendPartners(p),
    dataMode: "simulated",
  };
}

/** Persists the pilot profile + workspace when a DB is configured; otherwise a no-op
 * (the workspace is still returned to the caller). Returns whether it was stored. */
export async function savePilot(profile: InfraProfile, workspace: PilotWorkspace, orgId: string): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  await prisma.pilotProfile.create({
    data: {
      id: workspace.id,
      orgId,
      organisation: workspace.organisation,
      profile: profile as unknown as Prisma.InputJsonValue,
      workspace: workspace as unknown as Prisma.InputJsonValue,
    },
  });
  return true;
}
