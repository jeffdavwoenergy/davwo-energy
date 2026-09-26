"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Plug, Zap, Car, PoundSterling, Leaf, Lightbulb, ArrowRight, Clock, TrendingDown, Boxes, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fetcher } from "@/lib/swr";
import { formatGBP, formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import StatusPill from "@/components/shared/StatusPill";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import CarbonGauge from "@/components/shared/CarbonGauge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Metrics {
  active_chargers: number;
  charging_sessions: number;
  connected_vehicles: number;
  energy_consumption_mwh: number;
  average_cost_per_kwh: number;
  forecast_confidence_pct: number;
  today_summary: { co2_avoided_tco2: number; total_revenue_gbp: number };
  vs_yesterday: Record<string, number>;
  data_mode: string;
  data_sources?: string[];
  carbon_intensity_gco2_kwh?: number;
  carbon_intensity_index?: string;
  data_updated_at?: number;
}
type SeriesResp = { period: string; points: { time: string; value: number }[] };
type Recommendation = { title: string; detail: string; action: string; estimated_savings_gbp: number; confidence_pct: number };
type Alert = { id: string; severity: "high" | "medium" | "low"; title: string; asset: string; site: string };
type AssetSummary = { status: "healthy" | "degraded" | "down" };
interface Optimisation {
  load_shift: { shiftableKwh: number; peakKwh: number };
  price: { cheapest_at: string; min_pence: number; max_pence: number; spread_pence: number } | null;
  daily_saving_gbp: number;
  annual_saving_gbp: number;
  data_mode: string;
}
interface SmartWindow {
  available: boolean;
  best_at?: string;
  price_pence?: number;
  carbon_gco2?: number;
  vs_avg_price_pct?: number;
  vs_avg_carbon_pct?: number;
  auto_scheduled?: boolean;
}

const SEV_TONE = { high: "critical", medium: "warning", low: "info" } as const;

export default function DashboardPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const metrics = useSWR<Metrics>("/dashboard/metrics", fetcher, { refreshInterval: 30000 });
  const series = useSWR<SeriesResp>(`/dashboard/energy-series?period=${period}`, fetcher, { refreshInterval: 60000 });
  const rec = useSWR<Recommendation>("/dashboard/recommendation", fetcher);
  const alerts = useSWR<Alert[]>("/alerts", fetcher, { refreshInterval: 60000 });
  const opt = useSWR<Optimisation>("/optimisation", fetcher, { refreshInterval: 300000 });
  const smart = useSWR<SmartWindow>("/grid/smart-window", fetcher, { refreshInterval: 300000 });
  const assets = useSWR<AssetSummary[]>("/assets", fetcher, { refreshInterval: 60000 });

  const m = metrics.data;
  const o = opt.data;
  const sw = smart.data;
  const healthPct = assets.data?.length
    ? Math.round((assets.data.filter((a) => a.status === "healthy").length / assets.data.length) * 100)
    : null;

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle="Real-time view of network demand, cost and carbon across every connected asset."
        right={
          <div className="flex items-center gap-2">
            <DataSourceBadge
              mode={m?.data_mode || "synthetic"}
              sources={m?.data_sources}
              updatedAt={m?.data_updated_at}
            />
            <StatusPill tone="success">ANI™ Active</StatusPill>
          </div>
        }
      />

      {metrics.error && (
        <div className="mb-6">
          <ErrorBox message="Could not load metrics. Retrying…" />
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!m
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
          : (
            <>
              <KpiCard label="Active Chargers" value={formatNumber(m.active_chargers)} icon={Plug} tone="mint" delta={m.vs_yesterday?.active_chargers} defaultGlow />
              <KpiCard label="Charging Sessions" value={formatNumber(m.charging_sessions)} icon={Zap} tone="sky" delta={m.vs_yesterday?.charging_sessions} />
              <KpiCard label="Connected Vehicles" value={formatNumber(m.connected_vehicles)} icon={Car} tone="lavender" delta={m.vs_yesterday?.connected_vehicles} />
              <KpiCard label="Avg Cost / kWh" value={formatGBP(m.average_cost_per_kwh, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} icon={PoundSterling} tone="peach" delta={m.vs_yesterday?.average_cost} invertDelta live={m.data_mode === "live"} />
              <KpiCard label="CO₂ Avoided" value={formatNumber(m.today_summary?.co2_avoided_tco2, 1)} unit="tCO₂" icon={Leaf} tone="amber" delta={m.vs_yesterday?.co2_avoided} live={m.data_mode === "live"} />
            </>
          )}
      </div>

      {/* Total assets + system health */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        {!assets.data ? (
          <>
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
          </>
        ) : (
          <>
            <KpiCard label="Total Assets Connected" value={formatNumber(assets.data.length)} icon={Boxes} tone="mint" />
            <KpiCard
              label="System Health"
              value={healthPct != null ? `${healthPct}%` : "—"}
              caption={healthPct != null ? "Assets reporting healthy status" : undefined}
              icon={ShieldCheck}
              tone={healthPct != null && healthPct < 80 ? "amber" : "sky"}
            />
          </>
        )}
      </div>

      {/* Smart charging window — best price + carbon */}
      {sw?.available && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-navy to-navy-2 text-white p-5 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <Clock size={24} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Smart charging window</div>
              <div className="text-2xl font-display font-bold">Best time to charge: {sw.best_at}</div>
              <div className="text-xs text-slate-400">Cheapest + cleanest half-hour, from live UK price &amp; carbon</div>
              {sw.auto_scheduled && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <ShieldCheck size={13} /> Auto-scheduled by ANI™
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-6 sm:ml-auto">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Price</div>
              <div className="text-lg font-semibold">{sw.price_pence}p<span className="text-xs text-slate-400">/kWh</span></div>
              <div className="text-xs text-emerald-300">{Math.abs(sw.vs_avg_price_pct ?? 0)}% {(sw.vs_avg_price_pct ?? 0) <= 0 ? "cheaper" : "dearer"} vs avg</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Carbon</div>
              <div className="text-lg font-semibold">{sw.carbon_gco2}<span className="text-xs text-slate-400"> gCO₂/kWh</span></div>
              <div className="text-xs text-emerald-300">{Math.abs(sw.vs_avg_carbon_pct ?? 0)}% {(sw.vs_avg_carbon_pct ?? 0) <= 0 ? "cleaner" : "dirtier"} vs avg</div>
            </div>
          </div>
        </div>
      )}

      {/* Live cost & carbon insight */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel title="Live Grid Carbon" subtitle="UK national carbon intensity right now"
          right={<DataSourceBadge mode={m?.carbon_intensity_gco2_kwh != null ? "live" : "synthetic"} sources={["carbon_intensity"]} />}>
          <CarbonGauge intensity={m?.carbon_intensity_gco2_kwh} index={m?.carbon_intensity_index} />
        </Panel>

        <Panel className="lg:col-span-2" title="Cost & Carbon Optimisation"
          subtitle="Shift flexible load to the cheapest, cleanest window"
          right={o && <DataSourceBadge mode={o.data_mode} sources={o.data_mode === "live" ? ["octopus_agile"] : []} />}>
          {!o ? (
            <Skeleton className="h-[150px]" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 p-4">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold uppercase tracking-wider">
                  <TrendingDown size={14} /> Estimated saving
                </div>
                <div className="mt-1 text-3xl font-display font-bold text-emerald-700 dark:text-emerald-300">
                  {formatGBP(o.daily_saving_gbp)}<span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">/day</span>
                </div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
                  ≈ {formatGBP(o.annual_saving_gbp)}/yr by shifting {formatNumber(o.load_shift.shiftableKwh)} kWh of flexible load
                </div>
              </div>
              <div className="space-y-2.5">
                {o.price ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Clock size={14} /> Cheapest window</span>
                      <span className="font-semibold text-foreground">{o.price.cheapest_at}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Price range today</span>
                      <span className="font-semibold text-foreground">{o.price.min_pence}–{o.price.max_pence}p</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Spread to capture</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{o.price.spread_pence}p/kWh</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Live tariff window unavailable — using engine estimate.</div>
                )}
                <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  View price curve <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Chart + recommendation */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel
          className="lg:col-span-2"
          title="Energy Consumption"
          subtitle="MWh over the selected period"
          right={
            <Tabs value={period} onValueChange={(v: string) => setPeriod(v as typeof period)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          {!series.data ? (
            <Skeleton className="h-[280px]" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series.data.points} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <div className="bg-gradient-to-br from-navy to-navy-2 text-white rounded-2xl shadow-sm p-5 flex flex-col">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
            <Lightbulb size={14} /> ANI™ Recommendation
          </div>
          {!rec.data ? (
            <Skeleton className="h-32 mt-4 bg-white/10" />
          ) : (
            <div className="mt-3 flex-1 flex flex-col">
              <p className="text-sm text-slate-200 leading-relaxed">{rec.data.detail}</p>
              <div className="mt-3 text-sm font-semibold">{rec.data.action}</div>
              <div className="mt-auto pt-4 flex items-center justify-between text-xs">
                <span className="text-emerald-300 font-semibold">
                  Est. saving {formatGBP(rec.data.estimated_savings_gbp)}
                </span>
                <span className="text-slate-400">{rec.data.confidence_pct}% confidence</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      <Panel
        className="mt-4"
        title="Active Alerts"
        right={
          <Link href="/alerts" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        {!alerts.data ? (
          <Skeleton className="h-24" />
        ) : alerts.data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No active alerts.</div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.data.slice(0, 4).map((a) => (
              <div key={a.id} className="py-3 flex items-center gap-3">
                <StatusPill tone={SEV_TONE[a.severity]}>{a.severity}</StatusPill>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.asset} · {a.site}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
