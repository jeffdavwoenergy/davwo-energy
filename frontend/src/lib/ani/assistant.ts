// ANI assistant: turns a natural-language question into render-blocks built from
// REAL data. Capability selection is deterministic (keyword routing) so it works
// fully without an LLM; if OPENAI_API_KEY is set, the LLM adds a natural narrative
// over the same verified blocks (it never supplies the numbers).

import type { AssistantAnswer, Block, ChartPoint } from "./blocks";
import {
  assets as assetsProvider,
  forecastPayload,
  forecastAccuracy as forecastAccuracyProvider,
  metrics as metricsProvider,
  monitoring as monitoringProvider,
  insights as insightsProvider,
  optimisation as optimisationProvider,
  priceCurve as priceCurveProvider,
  smartWindow as smartWindowProvider,
} from "@/lib/server/providers";
import { fetchCarbonIntensity, fetchOctopusAgile } from "@/lib/data/regions/uk";
import { currentOrg } from "@/lib/server/context";
import { isLLMConfigured, callLLM, callLLMStream } from "@/lib/server/llm";
import { DEVICE_CAPABILITIES, DEVICE_DEFAULT, DEVICE_CONTEXT, type DeviceId } from "./deviceCapabilities";

const FUEL_COLORS: Record<string, string> = {
  gas: "#f59e0b", coal: "#475569", nuclear: "#8b5cf6", wind: "#22c55e", solar: "#facc15",
  hydro: "#0ea5e9", biomass: "#84cc16", imports: "#64748b", other: "#94a3b8",
};
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

interface Capability {
  id: string;
  label: string;
  keywords: string[];
  build: () => Promise<Block[]>;
  /** Solar/Battery/Fleet capabilities — only in play when that device is selected. */
  device?: DeviceId;
}

/** The Energy Devices switcher's selection, as sent by the chat UIs. */
export type ChatDevice = "ev" | DeviceId;
const isDeviceId = (d?: string): d is DeviceId => d === "solar" || d === "battery" || d === "fleet";

const CAPABILITIES: Capability[] = [
  {
    id: "carbon",
    label: "grid carbon intensity",
    keywords: ["carbon", "co2", "emission", "intensity", "clean", "green", "gco2"],
    build: async () => {
      const c = await fetchCarbonIntensity();
      if (!c) return [{ type: "text", text: "Live carbon intensity is unavailable right now." }];
      return [
        {
          type: "kpis",
          items: [
            { label: "Grid carbon", value: c.intensity_gco2_kwh, unit: "gCO₂/kWh", live: true },
            { label: "Intensity index", value: c.index ?? "—", live: true },
          ],
        },
        { type: "text", text: `The UK grid is currently rated **${c.index ?? "—"}** at ${c.intensity_gco2_kwh} gCO₂/kWh. Lower means cleaner electricity — a good window to schedule flexible charging.` },
      ];
    },
  },
  {
    id: "pricing",
    label: "live electricity price",
    keywords: ["price", "cost", "tariff", "£", "gbp", "pence", "agile", "cheap", "expensive"],
    build: async () => {
      const p = await fetchOctopusAgile();
      if (!p) return [{ type: "text", text: "Live tariff data is unavailable right now." }];
      return [
        {
          type: "kpis",
          items: [
            { label: "Current price", value: `${p.currency_symbol}${p.price_per_kwh.toFixed(3)}`, unit: "/kWh", live: true },
            { label: "Inc. VAT", value: `${p.minor_unit_value}${p.minor_unit_symbol}`, unit: "/kWh", live: true },
          ],
        },
        { type: "text", text: `Live Octopus Agile unit rate is **${p.minor_unit_value}${p.minor_unit_symbol}/kWh** (${p.product}). Half-hourly prices update through the day — shifting load to cheaper slots cuts cost directly.` },
      ];
    },
  },
  {
    id: "generation_mix",
    label: "UK generation mix",
    keywords: ["mix", "generation", "fuel", "wind", "solar", "gas", "nuclear", "powering", "source"],
    build: async () => {
      const c = await fetchCarbonIntensity();
      const mix = (c?.generation_mix ?? []).filter((m) => m.share > 0);
      if (!mix.length) return [{ type: "text", text: "Generation mix is unavailable right now." }];
      const data: ChartPoint[] = mix.map((m) => ({ label: m.name, value: m.share, color: FUEL_COLORS[m.name.toLowerCase()] ?? "#94a3b8" }));
      return [
        { type: "chart", chartType: "pie", title: "UK generation mix (live %)", unit: "%", data },
        { type: "text", text: "This is the live national fuel mix powering the grid — and therefore your chargers — right now." },
      ];
    },
  },
  {
    id: "forecast",
    label: "demand forecast",
    keywords: ["forecast", "predict", "tomorrow", "next", "future", "expect", "peak", "demand", "weather"],
    build: async () => {
      const f = await forecastPayload("14d", currentOrg());
      const data: ChartPoint[] = f.points.map((p) => ({ label: shortDate(p.time), value: p.value, lower: p.lower, upper: p.upper }));
      const blocks: Block[] = [
        { type: "chart", chartType: "area", title: "14-day demand forecast (MWh/day)", unit: "MWh", data, band: true },
        { type: "kpis", items: [
          { label: "Forecast peak", value: f.peak_mwh, unit: "MWh", live: !!f.weather },
          { label: "Confidence", value: `${f.confidence}%` },
        ] },
      ];
      if (f.drivers?.length) blocks.push({ type: "text", text: "Drivers: " + f.drivers.join("; ") + "." });
      return blocks;
    },
  },
  {
    id: "forecast_accuracy",
    label: "forecast accuracy",
    keywords: ["accurate", "accuracy", "reliable", "trust", "backtest", "how good", "track record", "error", "calibrat"],
    build: async () => {
      const bt = forecastAccuracyProvider();
      if (!bt.overallByHorizon.length) {
        return [{ type: "text", text: "There isn't enough history yet to backtest the forecast model." }];
      }
      const data: ChartPoint[] = bt.overallByHorizon.map((h) => ({ label: `${h.horizonDays}d`, value: h.mape ?? 0 }));
      const oneDay = bt.overallByHorizon[0];
      const lastDay = bt.overallByHorizon[bt.overallByHorizon.length - 1];
      return [
        { type: "chart", chartType: "bar", title: "Backtested forecast error by lead time (mean %)", unit: "%", data },
        { type: "kpis", items: [
          { label: "1-day-ahead error", value: oneDay.mape != null ? `${oneDay.mape}%` : "—", live: true },
          { label: "In-band rate", value: `${oneDay.coveragePct}%`, live: true },
        ] },
        {
          type: "text",
          text: `Backtested against ${bt.stationsEvaluated} stations' actual history, not just claimed: 1-day-ahead forecasts have averaged ${oneDay.mape != null ? `${oneDay.mape}% error` : "an unmeasurable error (too little non-zero history)"} and landed inside the forecast's own confidence band ${oneDay.coveragePct}% of the time. Accuracy naturally degrades further out — by ${lastDay.horizonDays} days ahead it's ${lastDay.mape != null ? `${lastDay.mape}%` : "unmeasurable"}.`,
        },
      ];
    },
  },
  {
    id: "monitoring",
    label: "live station status",
    keywords: ["status", "monitor", "online", "station", "health", "utilisation", "utilization"],
    build: async () => {
      const m = monitoringProvider();
      const rows = m.stations.map((s) => [s.name, s.status, `${s.portsOnline}/${s.portsTotal}`, `${Math.round(s.currentUtilisation * 100)}%`, `${s.currentLoadKw} kW`]);
      const util: ChartPoint[] = m.stations.map((s) => ({ label: s.name.split(" ")[0], value: Math.round(s.currentUtilisation * 100) }));
      return [
        { type: "chart", chartType: "bar", title: "Current utilisation by station", unit: "%", data: util },
        { type: "table", title: `${m.stationsOnline}/${m.stationsTotal} stations online`, columns: ["Station", "Status", "Ports", "Utilisation", "Load"], rows },
      ];
    },
  },
  {
    id: "assets",
    label: "asset register",
    keywords: ["asset", "charger", "register", "capacity", "site", "inventory", "fleet"],
    build: async () => {
      const a = await assetsProvider(currentOrg());
      const rows = a.map((x) => [x.name, x.status, x.ports, `${x.capacity_kw} kW`, `${x.utilisation_pct}%`, `${x.current_load_kw} kW`]);
      return [{ type: "table", title: "Asset register", columns: ["Asset", "Status", "Ports", "Capacity", "Utilisation", "Load"], rows }];
    },
  },
  {
    id: "insights",
    label: "ANI insights",
    keywords: ["insight", "issue", "problem", "risk", "recommend", "action", "alert", "fault", "attention", "wrong"],
    build: async () => {
      const ins = insightsProvider().slice(0, 5);
      if (!ins.length) return [{ type: "text", text: "No issues detected — the network is healthy across all sites." }];
      return ins.map((i) => ({
        type: "insight" as const,
        severity: i.severity,
        title: `${i.asset} — ${i.type.replace("_", " ")}`,
        detail: i.why,
        recommendation: i.recommendation,
      }));
    },
  },
  {
    id: "optimise",
    label: "cost optimisation",
    keywords: ["cheapest", "save", "saving", "savings", "optimis", "optimize", "shift", "off-peak", "offpeak", "best time", "when to charge", "schedule", "reduce cost"],
    build: async () => {
      const [opt, curve, sw] = await Promise.all([
        optimisationProvider(currentOrg()),
        priceCurveProvider(currentOrg()),
        smartWindowProvider(currentOrg()),
      ]);
      const blocks: Block[] = [
        {
          type: "kpis",
          items: [
            { label: "Best window", value: sw.available ? sw.best_at! : opt.price?.cheapest_at ?? "—", live: sw.available },
            { label: "Saving / day", value: `£${opt.daily_saving_gbp}`, live: opt.data_mode === "live" },
            { label: "Saving / year", value: `£${opt.annual_saving_gbp.toLocaleString("en-GB")}`, live: opt.data_mode === "live" },
            { label: "Shiftable load", value: opt.load_shift.shiftableKwh, unit: "kWh" },
          ],
        },
      ];
      if (sw.available) {
        blocks.push({
          type: "text",
          text: `The smartest charging window is **${sw.best_at}** — about ${Math.abs(sw.vs_avg_price_pct!)}% ${sw.vs_avg_price_pct! <= 0 ? "cheaper" : "dearer"} and ${Math.abs(sw.vs_avg_carbon_pct!)}% ${sw.vs_avg_carbon_pct! <= 0 ? "cleaner" : "dirtier"} than today's average (${sw.price_pence}p/kWh, ${sw.carbon_gco2} gCO₂/kWh).`,
        });
      }
      if ("points" in curve && curve.points.length) {
        blocks.push({
          type: "chart",
          chartType: "area",
          title: "Live half-hourly price (p/kWh)",
          unit: "p",
          data: curve.points.map((p) => ({ label: p.time, value: p.value })),
        });
      }
      blocks.push({
        type: "text",
        text: `Shifting ~${opt.load_shift.shiftableKwh} kWh of flexible peak load to the cheapest window${opt.price ? ` (around **${opt.price.cheapest_at}**)` : ""} could save about **£${opt.daily_saving_gbp}/day** (~£${opt.annual_saving_gbp.toLocaleString("en-GB")}/year).`,
      });
      return blocks;
    },
  },
  {
    id: "summary",
    label: "network overview",
    keywords: ["overview", "summary", "doing", "performance", "kpi", "headline", "report"],
    build: async () => {
      const m = await metricsProvider(currentOrg());
      return [
        { type: "kpis", items: [
          { label: "Energy (24h)", value: m.energy_consumption_mwh, unit: "MWh" },
          { label: "Avg cost/kWh", value: `£${m.average_cost_per_kwh.toFixed(3)}`, live: m.data_mode === "live" },
          { label: "Grid carbon", value: m.carbon_intensity_gco2_kwh ?? "—", unit: "gCO₂/kWh", live: m.carbon_intensity_gco2_kwh != null },
          { label: "CO₂ avoided", value: m.today_summary.co2_avoided_tco2, unit: "tCO₂" },
        ] },
        { type: "text", text: `Over the last 24h the network delivered ${m.energy_consumption_mwh} MWh across ${m.charging_sessions} sessions at a live grid price of £${m.average_cost_per_kwh.toFixed(3)}/kWh.` },
      ];
    },
  },
];

/** Page path -> capability bias, so ANI already "knows where the user is".
 * Explicit keywords always win; context only disambiguates vague questions. */
const CONTEXT_CAPABILITY: Record<string, string> = {
  "/forecasting": "forecast",
  "/monitoring": "monitoring",
  "/assets": "assets",
  "/alerts": "insights",
  "/analytics": "price",
  "/dashboard": "summary",
  "/map": "monitoring",
  "/reports": "summary",
  "/marketplace": "insights",
};

export function contextCapabilityId(context?: string): string | undefined {
  if (!context) return undefined;
  const hit = Object.keys(CONTEXT_CAPABILITY).find((p) => context.startsWith(p));
  return hit ? CONTEXT_CAPABILITY[hit] : undefined;
}

function selectCapabilities(question: string, context?: string, device?: string): Capability[] {
  const q = question.toLowerCase();
  // With Solar/Battery/Fleet selected, its capabilities join the pool and win
  // ties against the generic EV/grid ones (half a keyword's worth of bias).
  const pool: Capability[] = isDeviceId(device) ? [...CAPABILITIES, ...DEVICE_CAPABILITIES] : CAPABILITIES;
  const scored = pool
    .map((c) => {
      const hits = c.keywords.filter((k) => q.includes(k)).length;
      return { c, score: hits ? hits + (c.device && c.device === device ? 0.5 : 0) : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length) {
    // Answer only what was actually asked: a single clearly-best match wins
    // outright. A second capability only joins when it's a genuine tie for
    // strongest match (the question really does span two topics, e.g.
    // "cheapest and cleanest time to charge") — not just because it happened
    // to share one keyword with a much stronger match.
    const top = scored[0].score;
    return scored.filter((x) => x.score === top).slice(0, 2).map((x) => x.c);
  }
  if (isDeviceId(device)) {
    const ctx = DEVICE_CONTEXT[device] ?? {};
    const hit = context ? Object.keys(ctx).find((p) => context.startsWith(p)) : undefined;
    const id = hit ? ctx[hit] : DEVICE_DEFAULT[device];
    return [DEVICE_CAPABILITIES.find((c) => c.id === id)!];
  }
  const ctxId = contextCapabilityId(context);
  const ctxCap = ctxId ? CAPABILITIES.find((c) => c.id === ctxId) : undefined;
  return [ctxCap ?? CAPABILITIES.find((c) => c.id === "summary")!];
}

function templateIntro(caps: Capability[]): string {
  const labels = caps.map((c) => c.label);
  const list = labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1] : labels[0];
  return caps.some((c) => c.device) ? `Here's the ${list}:` : `Here's the ${list}, from live data:`;
}

const NARRATE_SYSTEM_PROMPT =
  "You are ANI™, an energy-infrastructure analyst — warm, direct and easy to talk to, not a rigid report generator. " +
  "You are shown charts/tables built from live grid data, chosen specifically to answer what the user just asked — " +
  "stay on that topic and don't volunteer unrelated data they didn't ask for. Write a natural, conversational 1-2 " +
  "sentence lead-in that answers the question directly. NEVER invent specific numbers — the visuals carry the figures. No markdown headers.";

const narratePrompt = (question: string, labels: string[]) =>
  `User asked: "${question}". The dashboard is showing: ${labels.join(", ")}. Write the lead-in.`;

export async function answer(question: string, context?: string, device?: ChatDevice): Promise<AssistantAnswer> {
  const caps = selectCapabilities(question, context, device);
  const built = await Promise.all(caps.map((c) => c.build()));
  const blocks = built.flat();

  let intro: string | null = null;
  let mode: AssistantAnswer["mode"] = "deterministic";
  if (isLLMConfigured()) {
    intro = await callLLM(NARRATE_SYSTEM_PROMPT, narratePrompt(question, caps.map((c) => c.label)), 220);
    if (intro) mode = "live-llm";
  }
  if (!intro) intro = templateIntro(caps);

  return { blocks: [{ type: "text", text: intro }, ...blocks], capabilities: caps.map((c) => c.id), mode };
}

/** Same answer as answer(), but the narration streams token-by-token via
 * onDelta as the LLM generates it (or arrives as one deterministic chunk when
 * no OPENAI_API_KEY is set) — blocks themselves are structured data
 * computed synchronously, not naturally streamable, so they're returned
 * whole in the final AssistantAnswer once narration finishes. */
export async function streamAnswer(
  question: string, context: string | undefined, onDelta: (chunk: string) => void, device?: ChatDevice,
): Promise<AssistantAnswer> {
  const caps = selectCapabilities(question, context, device);
  const built = await Promise.all(caps.map((c) => c.build()));
  const blocks = built.flat();

  let intro: string | null = null;
  let mode: AssistantAnswer["mode"] = "deterministic";
  if (isLLMConfigured()) {
    intro = await callLLMStream(NARRATE_SYSTEM_PROMPT, narratePrompt(question, caps.map((c) => c.label)), 220, onDelta);
    if (intro) mode = "live-llm";
  }
  if (!intro) {
    intro = templateIntro(caps);
    onDelta(intro);
  }

  return { blocks: [{ type: "text", text: intro }, ...blocks], capabilities: caps.map((c) => c.id), mode };
}

export const SUGGESTED_PROMPTS = [
  "How is the network doing today?",
  "What's the live grid carbon right now?",
  "Show me the demand forecast",
  "Which sites need attention?",
  "What's powering the grid?",
  "How much does electricity cost right now?",
];
