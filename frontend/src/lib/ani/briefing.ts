import {
  insights, optimisation, smartWindow, faultSummary, comparisonSummary,
} from "@/lib/server/providers";
import { getNetwork } from "@/lib/ani/network";
import { currentOrg } from "@/lib/server/context";

/**
 * Proactive briefing — ANI opens the conversation instead of waiting to be
 * asked. Each priority follows the explainable-AI structure:
 * Observation → Explanation → Recommendation → Expected impact.
 */
export interface BriefingItem {
  observation: string;
  explanation: string;
  recommendation: string;
  impact: { savings_gbp?: number; carbon_pct?: number; confidence_pct: number };
  severity: "high" | "medium" | "low";
}

export interface Briefing {
  greeting: string;
  learning_line: string;
  items: BriefingItem[];
  generated_at: string;
}

function greeting(): string {
  const h = new Date().getUTCHours();
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

export async function buildBriefing(): Promise<Briefing> {
  const net = getNetwork();
  const [opt, sw, cmp, faults] = await Promise.all([
    optimisation(currentOrg()), smartWindow(currentOrg()), comparisonSummary("week", { orgId: currentOrg() }), faultSummary(currentOrg()),
  ]);
  const ins = insights();
  const items: BriefingItem[] = [];

  // Faults first — highest operational urgency.
  for (const f of faults.faults.slice(0, 2)) {
    items.push({
      observation: `${f.name} — ${f.detail.toLowerCase()}.`,
      explanation: f.kind === "recurring_fault"
        ? `A ${f.fault_rate_pct}% fault rate over the last 24h suggests an intermittent hardware or connectivity issue.`
        : "Port telemetry shows the site is not delivering its rated capacity.",
      recommendation: f.kind === "offline"
        ? "Dispatch an engineer — the site is earning nothing while offline."
        : "Schedule an inspection before the fault degrades further.",
      impact: { confidence_pct: 88 },
      severity: f.kind === "offline" ? "high" : "medium",
    });
  }

  // Underutilisation / risks from the analysis engine.
  const under = ins.find((i) => i.type === "underutilised");
  if (under) {
    items.push({
      observation: `${under.asset} is operating below expected utilisation.`,
      explanation: under.why,
      recommendation: under.recommendation,
      impact: { confidence_pct: Math.round(under.confidence * 100) },
      severity: "medium",
    });
  }

  // Cost optimisation — the headline number.
  if (opt.daily_saving_gbp > 0) {
    items.push({
      observation: `An estimated £${Math.round(opt.daily_saving_gbp * 7).toLocaleString()} optimisation opportunity this week.`,
      explanation: `${Math.round(opt.load_shift.shiftableKwh)} kWh/day of flexible load is currently charged outside the cheapest window${opt.price ? ` (today's spread: ${opt.price.spread_pence}p/kWh)` : ""}.`,
      recommendation: sw.available && sw.best_at
        ? `Shift flexible charging into the ${sw.best_at} window — today's cheapest, cleanest half-hour.`
        : "Shift flexible charging into the off-peak window ANI identifies each day.",
      impact: { savings_gbp: Math.round(opt.daily_saving_gbp * 7), confidence_pct: 84 },
      severity: "medium",
    });
  }

  // Carbon opportunity from the smart window.
  if (sw.available && typeof sw.vs_avg_carbon_pct === "number" && sw.vs_avg_carbon_pct < 0) {
    items.push({
      observation: `A ${Math.abs(sw.vs_avg_carbon_pct)}% carbon reduction is available today.`,
      explanation: `Grid carbon at ${sw.best_at} is ${Math.abs(sw.vs_avg_carbon_pct)}% below today's average (${sw.carbon_gco2} gCO2/kWh).`,
      recommendation: "Align flexible load to the clean window to bank the reduction.",
      impact: { carbon_pct: Math.abs(sw.vs_avg_carbon_pct), confidence_pct: 90 },
      severity: "low",
    });
  }

  // Week-over-week context.
  items.push({
    observation: `Energy delivered is ${cmp.deltas.energy >= 0 ? "up" : "down"} ${Math.abs(cmp.deltas.energy)}% week-over-week (${cmp.current.energy_mwh} MWh).`,
    explanation: `Sessions moved ${cmp.deltas.sessions >= 0 ? "+" : ""}${cmp.deltas.sessions}% against the preceding week.`,
    recommendation: cmp.deltas.energy >= 10
      ? "Review capacity headroom at your busiest sites before the trend compounds."
      : "No action needed — demand is within normal variation.",
    impact: { confidence_pct: 95 },
    severity: "low",
  });

  return {
    greeting: greeting(),
    learning_line: `I've analysed ${net.rangeDays} days of history across ${net.stations.length} sites — my model of your network sharpens with every day of data.`,
    items: items.slice(0, 4),
    generated_at: new Date().toISOString(),
  };
}
