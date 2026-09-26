"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Zap, PoundSterling, Leaf, Factory, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatGBP, formatNumber, deltaLabel, deltaClass } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import KpiCard from "@/components/shared/KpiCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Period = "day" | "week" | "month";
const PERIOD_LABEL: Record<Period, string> = { day: "day", week: "week", month: "month" };

interface Totals { energy_mwh: number; sessions: number; cost_gbp: number; co2_avoided_t: number; }
interface Comparison {
  period: Period; window_days: number;
  range: { from: string; to: string };
  current: Totals; previous: Totals;
  deltas: { energy: number; sessions: number; cost: number; co2_avoided: number };
  data_mode: string; data_sources?: string[];
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function CompareTile({ label, value, delta, periodLabel, invert }: { label: string; value: string; delta: number; periodLabel: string; invert?: boolean }) {
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground font-display">{value}</div>
      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${deltaClass(delta, invert)}`}>
        <Icon size={13} /> {deltaLabel(delta)} <span className="text-muted-foreground font-normal">vs {periodLabel}</span>
      </div>
    </div>
  );
}

interface Metrics {
  energy_consumption_mwh: number;
  average_cost_per_kwh: number;
  today_summary: { co2_avoided_tco2: number; total_revenue_gbp: number };
  carbon_intensity_gco2_kwh?: number;
  data_mode: string;
  data_sources?: string[];
}
type Series = { points: { time: string; value: number }[] };
type GenMix = { mix: { name: string; share: number }[]; intensity_gco2_kwh: number; index: string };
type Asset = { id: string; name: string; utilisation_pct: number; current_load_kw: number; capacity_kw: number };
type PriceCurve = {
  points: { time: string; value: number }[];
  min_pence?: number; max_pence?: number; avg_pence?: number; cheapest_at?: string; spread_pence?: number;
  data_mode: string;
};

const FUEL_COLORS: Record<string, string> = {
  gas: "#f59e0b", coal: "#475569", nuclear: "#8b5cf6", wind: "#22c55e", solar: "#facc15",
  hydro: "#0ea5e9", biomass: "#84cc16", imports: "#64748b", other: "#94a3b8",
};
const colorFor = (name: string) => FUEL_COLORS[name.toLowerCase()] ?? "#94a3b8";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const rangeError = rangeFrom && rangeTo && new Date(rangeFrom) >= new Date(rangeTo) ? "End date must be after the start date." : null;

  const metrics = useSWR<Metrics>("/dashboard/metrics", fetcher, { refreshInterval: 60000 });
  const series = useSWR<Series>(`/dashboard/energy-series?period=${period}`, fetcher);
  const compareQuery = customRange
    ? `/analytics/summary?period=${period}&from=${customRange.from}&to=${customRange.to}`
    : `/analytics/summary?period=${period}`;
  const compare = useSWR<Comparison>(compareQuery, fetcher, { refreshInterval: 300000 });
  const mix = useSWR<GenMix>("/grid/generation-mix", fetcher, { refreshInterval: 300000 });
  const assets = useSWR<Asset[]>("/assets", fetcher);
  const price = useSWR<PriceCurve>("/grid/price-curve", fetcher, { refreshInterval: 300000 });

  const m = metrics.data;
  const cmp = compare.data;
  const pc = price.data;
  const mixData = (mix.data?.mix ?? []).filter((x) => x.share > 0).map((x) => ({ name: x.name, value: x.share }));
  const topAssets = [...(assets.data ?? [])].sort((a, b) => b.current_load_kw - a.current_load_kw).slice(0, 6)
    .map((a) => ({ name: a.name.split(" ")[0], load: a.current_load_kw, util: a.utilisation_pct }));

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Energy, cost, carbon and utilisation analytics with live UK grid context."
        right={m && <DataSourceBadge mode={m.data_mode} sources={m.data_sources} />}
      />

      {metrics.error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!m ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label="Energy (24h)" value={m.energy_consumption_mwh} unit="MWh" icon={Zap} tone="mint" />
            <KpiCard label="Avg Cost / kWh" value={formatGBP(m.average_cost_per_kwh, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} icon={PoundSterling} tone="peach" live={m.data_mode === "live"} />
            <KpiCard label="CO₂ Avoided" value={formatNumber(m.today_summary.co2_avoided_tco2, 2)} unit="tCO₂" icon={Leaf} tone="amber" live={m.data_mode === "live"} />
            <KpiCard label="Grid Carbon" value={m.carbon_intensity_gco2_kwh ?? "—"} unit="gCO₂/kWh" icon={Factory} tone="lavender" live={m.carbon_intensity_gco2_kwh != null} />
          </>
        )}
      </div>

      {/* Period-over-period comparison */}
      <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg text-foreground">Period-over-period</h3>
          <p className="text-xs text-muted-foreground">
            {customRange && cmp
              ? `${fmtDate(cmp.range.from)} – ${fmtDate(cmp.range.to)}, vs the same-length period before it.`
              : `Current vs the preceding ${PERIOD_LABEL[period]}, from network history.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cmp && <DataSourceBadge mode={cmp.data_mode} sources={cmp.data_sources} />}
          <Tabs value={period} onValueChange={(v: string) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 mb-3 text-xs">
        <label className="flex flex-col gap-1 text-muted-foreground">
          From
          <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-auto py-1.5 text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          To
          <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-auto py-1.5 text-xs" />
        </label>
        <Button
          onClick={() => rangeFrom && rangeTo && !rangeError && setCustomRange({ from: new Date(`${rangeFrom}T00:00:00.000Z`).toISOString(), to: new Date(`${rangeTo}T23:59:59.999Z`).toISOString() })}
          disabled={!rangeFrom || !rangeTo || !!rangeError}
          size="sm"
          className="h-auto py-1.5"
        >
          Apply custom range
        </Button>
        {customRange && (
          <Button
            onClick={() => { setCustomRange(null); setRangeFrom(""); setRangeTo(""); }}
            variant="outline"
            size="sm"
            className="h-auto py-1.5"
          >
            Clear
          </Button>
        )}
        {rangeError && <span className="text-red-600">{rangeError}</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!cmp ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />)
        ) : (
          <>
            {(() => {
              const periodLabel = customRange ? "prior period" : `prev ${PERIOD_LABEL[period]}`;
              return (
                <>
                  <CompareTile label="Energy" value={`${cmp.current.energy_mwh} MWh`} delta={cmp.deltas.energy} periodLabel={periodLabel} />
                  <CompareTile label="Sessions" value={formatNumber(cmp.current.sessions)} delta={cmp.deltas.sessions} periodLabel={periodLabel} />
                  <CompareTile label="Est. Cost" value={formatGBP(cmp.current.cost_gbp)} delta={cmp.deltas.cost} periodLabel={periodLabel} invert />
                  <CompareTile label="CO₂ Avoided" value={`${cmp.current.co2_avoided_t} tCO₂`} delta={cmp.deltas.co2_avoided} periodLabel={periodLabel} />
                </>
              );
            })()}
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel title="UK Generation Mix" subtitle="Live national grid — what's powering charging right now"
          right={mix.data && <DataSourceBadge mode="live" sources={["carbon_intensity"]} />}>
          {mix.error || (mix.data && !mixData.length) ? (
            <EmptyBox message="Generation mix unavailable right now." />
          ) : !mix.data ? (
            <Skeleton className="h-[280px]" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
                  {mixData.map((d, i) => <Cell key={i} fill={colorFor(d.name)} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Energy Trend" subtitle={`Network energy delivered (MWh) — ${PERIOD_LABEL[period]} view`}>
          {!series.data ? (
            <Skeleton className="h-[280px]" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={series.data.points} margin={{ left: -18, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} cursor={{ fill: "hsl(var(--accent))" }} />
                <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Live Electricity Price (Octopus Agile)"
        subtitle="Half-hourly unit rate — shift flexible load to the troughs"
        right={pc && pc.data_mode === "live" && <DataSourceBadge mode="live" sources={["octopus_agile"]} />}>
        {!pc ? (
          <Skeleton className="h-[240px]" />
        ) : !pc.points.length ? (
          <EmptyBox message="Live tariff data unavailable right now." />
        ) : (
          <>
            <div className="flex flex-wrap gap-4 mb-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Clock size={14} className="text-emerald-600" /> Cheapest <strong className="text-foreground">{pc.cheapest_at}</strong></span>
              <span className="text-muted-foreground">Range <strong className="text-foreground">{pc.min_pence}–{pc.max_pence}p</strong></span>
              <span className="text-muted-foreground">Avg <strong className="text-foreground">{pc.avg_pence}p</strong></span>
              <span className="text-muted-foreground">Spread <strong className="text-emerald-600">{pc.spread_pence}p/kWh</strong></span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pc.points} margin={{ left: -16, top: 8, right: 8 }}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} unit="p" />
                <Tooltip formatter={(v) => `${v}p/kWh`} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                {pc.avg_pence != null && <ReferenceLine y={pc.avg_pence} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "avg", fontSize: 10, fill: "hsl(var(--muted-foreground))", position: "right" }} />}
                <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-4))" strokeWidth={2} fill="url(#pg)" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </Panel>

      <Panel className="mt-4" title="Top Assets by Load" subtitle="Highest current draw across the network">
        {!assets.data ? (
          <Skeleton className="h-[240px]" />
        ) : !topAssets.length ? (
          <EmptyBox />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topAssets} layout="vertical" margin={{ left: 20, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" kW" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} width={80} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} cursor={{ fill: "hsl(var(--accent))" }} />
              <Bar dataKey="load" fill="hsl(var(--chart-2))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
