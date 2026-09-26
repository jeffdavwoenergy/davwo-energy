"use client";

import { Link } from "@/i18n/navigation";
import useSWR from "swr";
import {
  Activity, LineChart, TrendingUp, MessageCircle, SlidersHorizontal, Store,
  ArrowRight, Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import Panel from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";

type Metrics = { energy_consumption_mwh: number; average_cost_per_kwh: number; carbon_intensity_gco2_kwh?: number };
type Smart = { available: boolean; best_at?: string };

interface Stage {
  n: number;
  to: string;
  icon: LucideIcon;
  title: string;
  input: string;
  intelligence: string;
  decision: string;
}

// The complete ANI™ story: raw data -> intelligence -> a business decision.
const JOURNEY: Stage[] = [
  { n: 1, to: "/monitoring", icon: Activity, title: "Monitor",
    input: "Live telemetry from every charger, port and site.",
    intelligence: "ANI™ tracks status, utilisation and faults in real time.",
    decision: "Know instantly what's running and what needs attention." },
  { n: 2, to: "/analytics", icon: LineChart, title: "Analyse",
    input: "Consumption, live UK tariffs and grid carbon.",
    intelligence: "ANI™ correlates usage against cost and carbon.",
    decision: "See exactly where money and emissions are going." },
  { n: 3, to: "/forecasting", icon: TrendingUp, title: "Predict",
    input: "History plus weather and demand drivers.",
    intelligence: "ANI™ forecasts demand with a confidence band.",
    decision: "Plan capacity and staffing before the peak, not after." },
  { n: 4, to: "/ai-assistant", icon: MessageCircle, title: "Recommend",
    input: "Any question, in plain language.",
    intelligence: "Ask ANI™ answers in live charts, tables and KPIs.",
    decision: "Get an actionable answer without touching a spreadsheet." },
  { n: 5, to: "/dashboard", icon: SlidersHorizontal, title: "Optimise",
    input: "Live price and carbon across the day.",
    intelligence: "ANI™ finds the cheapest, cleanest charging window.",
    decision: "Shift flexible load and capture the saving automatically." },
  { n: 6, to: "/marketplace", icon: Store, title: "Marketplace",
    input: "Your profile, objectives and gaps.",
    intelligence: "ANI™ matches you to verified technology & service partners.",
    decision: "Act on a recommendation — an ecosystem, not a dead end." },
];

export default function DemoPage() {
  const { data: m } = useSWR<Metrics>("/dashboard/metrics", fetcher);
  const { data: sw } = useSWR<Smart>("/grid/smart-window", fetcher);

  return (
    <div>
      <PageHeader title="The ANI™ Story" subtitle="How Augmented Network Intelligence turns raw energy data into business decisions." />

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-2 text-white p-6 mb-4">
        <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
          <MessageCircle size={18} /> Augmented Network Intelligence
        </div>
        <h2 className="mt-2 text-2xl font-display font-bold max-w-2xl">
          Not another dashboard — an intelligence layer that learns your organisation.
        </h2>
        <p className="mt-2 text-sm text-slate-300 max-w-2xl">
          Follow the journey below from live data to a clear decision, then start a pilot and watch ANI™
          build you a working workspace in under a minute.
        </p>
        <div className="mt-5 flex flex-wrap gap-6">
          <Metric label="Energy (24h)" value={m ? `${m.energy_consumption_mwh} MWh` : "…"} />
          <Metric label="Live price" value={m ? `£${m.average_cost_per_kwh.toFixed(3)}/kWh` : "…"} />
          <Metric label="Grid carbon" value={m?.carbon_intensity_gco2_kwh != null ? `${m.carbon_intensity_gco2_kwh} gCO₂` : "…"} />
          <Metric label="Best charge window" value={sw?.available ? (sw.best_at ?? "…") : "…"} accent />
        </div>
        <Button asChild className="mt-6 gap-2">
          <Link href="/demo/start"><Rocket size={16} /> Start your pilot — build a workspace now</Link>
        </Button>
      </div>

      {/* The journey */}
      <Panel title="From data to decision" subtitle="Six steps — each a live, real-data view you can open now">
        <div className="space-y-3">
          {JOURNEY.map((s) => (
            <Link key={s.n} href={s.to}
              className="group flex flex-col sm:flex-row gap-4 rounded-2xl border border-border p-4 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 transition">
              <div className="flex items-center gap-3 sm:w-44 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center justify-center relative">
                  <s.icon size={20} />
                  <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center">{s.n}</span>
                </div>
                <div className="font-display font-semibold text-foreground">{s.title}</div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 flex-1 text-xs">
                <Cell tag="Data in" text={s.input} />
                <Cell tag="ANI™ intelligence" text={s.intelligence} accent />
                <Cell tag="Your decision" text={s.decision} />
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-emerald-500 transition self-center hidden sm:block" />
            </Link>
          ))}
        </div>
      </Panel>

      {/* Closing CTA */}
      <div className="mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="font-display font-semibold text-lg text-foreground">Ready to see it on your own infrastructure?</div>
          <p className="text-sm text-muted-foreground mt-1">
            Answer a few questions and ANI™ creates a pilot workspace with instant, profile-based insights — no empty dashboard, no live integration required to begin.
          </p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link href="/demo/start"><Rocket size={16} /> Start your pilot</Link>
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}

function Cell({ tag, text, accent }: { tag: string; text: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/25" : "bg-accent"}`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${accent ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"}`}>{tag}</div>
      <div className="mt-1 text-foreground/80 leading-snug">{text}</div>
    </div>
  );
}
