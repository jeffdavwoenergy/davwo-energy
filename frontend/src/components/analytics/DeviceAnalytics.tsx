"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Route, Zap, PoundSterling, Leaf, Gauge, Sun, Home, Percent, RefreshCw, HeartPulse } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FleetAnalytics, SolarAnalytics, BatteryAnalytics, AnalyticsPeriod } from "@/lib/server/deviceAnalytics";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const PERIOD_LABEL: Record<AnalyticsPeriod, string> = { day: "last 24 hours", week: "last 7 days", month: "last 30 days", quarter: "last 90 days" };

function usePeriodData<T>(device: string) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const swr = useSWR<T>(`/analytics/device?device=${device}&period=${period}`, fetcher);
  const tabs = (
    <Tabs value={period} onValueChange={(v: string) => setPeriod(v as AnalyticsPeriod)}>
      <TabsList>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="quarter">Quarter</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return { ...swr, period, tabs };
}

function KpiRow({ loading, children, n = 5 }: { loading: boolean; children: React.ReactNode; n?: number }) {
  return (
    <div className={`grid grid-cols-2 ${n === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-4`}>
      {loading ? Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-[130px]" />) : children}
    </div>
  );
}

// ---------------------------------------------------------------- Fleet -----
export function FleetAnalyticsView() {
  const { data, error, period, tabs } = usePeriodData<FleetAnalytics>("fleet");
  const days = (data?.days ?? []).map((d) => ({ ...d, label: dayLabel(d.date) }));
  const mixTotal = data?.chargingMix.reduce((s, c) => s + c.kwh, 0) ?? 0;
  const MIX_COLOR = ["#10b981", "#0ea5e9", "#f59e0b"];

  return (
    <div>
      <PageHeader title="Fleet Analytics" subtitle={`Mileage, cost, efficiency and carbon across the fleet — ${PERIOD_LABEL[period]}.`} right={tabs} />
      {error && <div className="mb-6"><ErrorBox /></div>}
      <KpiRow loading={!data}>
        {data && (
          <>
            <KpiCard label="Miles Driven" value={formatNumber(data.totals.miles)} unit="mi" icon={Route} tone="lavender" />
            <KpiCard label="Energy Used" value={formatNumber(data.totals.kwh)} unit="kWh" icon={Zap} tone="sky" />
            <KpiCard label="Cost per Mile" value={`£${data.totals.costPerMileGbp.toFixed(3)}`} icon={PoundSterling} tone="peach" caption={`£${formatNumber(data.totals.costGbp)} in total`} />
            <KpiCard label="Efficiency" value={data.totals.avgMiPerKwh.toFixed(2)} unit="mi/kWh" icon={Gauge} tone="white" />
            <KpiCard label="CO₂ Saved" value={formatNumber(data.totals.co2SavedKg / 1000, 1)} unit="t" icon={Leaf} tone="mint" caption="vs equivalent diesel vehicles" />
          </>
        )}
      </KpiRow>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="Miles per Day" subtitle="Whole fleet">
          {!data ? <Skeleton className="h-[240px]" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={days} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} mi`, "Miles"]} />
                <Bar dataKey="miles" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Efficiency vs Temperature" subtitle="Each dot is a day: % of the fleet's normal efficiency — EVs go less far in the cold">
          {!data ? <Skeleton className="h-[240px]" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ left: -8, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="tempC" name="Overnight low" unit="°C" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis type="number" dataKey="efficiencyPct" name="Efficiency" unit="%" domain={["dataMin - 3", 100]} tick={AXIS} tickLine={false} axisLine={false} width={54} />
                <ZAxis range={[40, 40]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [n === "Overnight low" ? `${v}°C` : `${v}% of normal`, n]} />
                <Scatter data={days.filter((d) => d.kwh > 0)} fill="#0ea5e9" />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="Vehicle League Table" subtitle="Most efficient first" bodyClassName="p-0">
          {!data ? <div className="p-5"><Skeleton className="h-64" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-5 py-2.5 font-medium">Vehicle</th>
                    <th className="px-3 py-2.5 font-medium text-right">Miles</th>
                    <th className="px-3 py-2.5 font-medium text-right">mi/kWh</th>
                    <th className="px-3 py-2.5 font-medium text-right">£/mile</th>
                    <th className="px-3 py-2.5 font-medium w-36">Days in use</th>
                    <th className="px-5 py-2.5 font-medium text-right">CO₂ saved</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vehicles.map((v, i) => (
                    <tr key={v.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-2.5">
                        <span className="text-muted-foreground mr-2 text-xs">{i + 1}</span>
                        <span className="font-medium text-foreground">{v.name}</span> <span className="text-[11px] font-mono text-muted-foreground">{v.reg}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{formatNumber(v.miles)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{v.miPerKwh.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right">£{v.costPerMileGbp.toFixed(3)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-violet-500" style={{ width: `${v.utilisationPct}%` }} /></div>
                          <span className="text-xs text-muted-foreground w-9 text-right">{v.utilisationPct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">{formatNumber(v.co2SavedKg)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Where Vehicles Charge" subtitle="Share of energy and what it costs">
          {!data ? <Skeleton className="h-48" /> : (
            <div className="space-y-4">
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                {data.chargingMix.map((c, i) => <div key={c.where} style={{ width: `${(c.kwh / Math.max(1, mixTotal)) * 100}%`, backgroundColor: MIX_COLOR[i] }} />)}
              </div>
              {data.chargingMix.map((c, i) => (
                <div key={c.where} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MIX_COLOR[i] }} /> {c.where}</span>
                  <span className="text-right">
                    <span className="font-semibold text-foreground">£{formatNumber(c.costGbp)}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatNumber(c.kwh)} kWh · {c.pencePerKwh}p/kWh</span>
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground border-t border-border pt-3">Public rapid charging costs ~4× depot power — every session moved back to the depot saves money.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Solar -----
export function SolarAnalyticsView() {
  const { data, error, period, tabs } = usePeriodData<SolarAnalytics>("solar");
  const days = (data?.days ?? []).map((d) => ({ ...d, label: dayLabel(d.date) }));
  const maxLoss = Math.max(1, ...(data?.losses.map((l) => l.kwh) ?? [1]));

  return (
    <div>
      <PageHeader title="Solar Analytics" subtitle={`Generation, performance and earnings — ${PERIOD_LABEL[period]}.`} right={tabs} />
      {error && <div className="mb-6"><ErrorBox /></div>}
      <KpiRow loading={!data}>
        {data && (
          <>
            <KpiCard label="Generated" value={formatNumber(data.totals.kwh)} unit="kWh" icon={Sun} tone="amber" />
            <KpiCard label="Performance" value={`${data.totals.avgPerformancePct}%`} icon={Percent} tone="sky" caption="Of what the weather allowed" />
            <KpiCard label="Used On Site" value={`${data.totals.selfUsePct}%`} icon={Home} tone="lavender" caption={`Worth £${formatNumber(data.totals.selfUseValueGbp)}`} />
            <KpiCard label="Export Earnings" value={`£${formatNumber(data.totals.exportEarningsGbp)}`} icon={PoundSterling} tone="mint" />
            <KpiCard label="CO₂ Avoided" value={formatNumber(data.totals.co2AvoidedKg / 1000, 2)} unit="t" icon={Leaf} tone="peach" />
          </>
        )}
      </KpiRow>

      <Panel className="mt-4" title="Daily Generation" subtitle="Actual vs what the weather allowed, kWh">
        {!data ? <Skeleton className="h-[260px]" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={days} margin={{ left: -8, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="saActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="expectedKwh" name="Expected" stroke="#94a3b8" strokeDasharray="5 5" fill="none" strokeWidth={2} />
              <Area type="monotone" dataKey="kwh" name="Actual" stroke="#f59e0b" fill="url(#saActual)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Array Ranking" subtitle="kWh per kWp installed — like-for-like across sizes">
          {!data ? <Skeleton className="h-48" /> : (
            <div className="space-y-3">
              {data.arrays.map((a) => (
                <div key={a.name}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-foreground">{a.name} <span className="text-xs text-muted-foreground">· {a.site} · {formatNumber(a.capacityKwp)} kWp</span></span>
                    <span className="font-semibold">{a.kwhPerKwp} <span className="text-xs text-muted-foreground font-normal">kWh/kWp</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${a.performancePct < 90 ? "bg-amber-400" : "bg-amber-500"}`} style={{ width: `${(a.kwhPerKwp / Math.max(1, data.arrays[0].kwhPerKwp)) * 100}%` }} />
                  </div>
                  {a.performancePct < 90 && <div className="text-[11px] text-amber-700 mt-0.5">Running at {a.performancePct}% — likely dirty or shaded</div>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Where Generation Was Lost" subtitle="kWh below a clear-sky ideal, by cause">
          {!data ? <Skeleton className="h-48" /> : (
            <div className="space-y-3">
              {data.losses.map((l) => (
                <div key={l.cause}>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{l.cause}</span><span className="font-semibold">{formatNumber(l.kwh)} kWh</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-slate-400" style={{ width: `${(l.kwh / maxLoss) * 100}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Weather you can&apos;t change; dirt and downtime you can.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Battery -----
export function BatteryAnalyticsView() {
  const { data, error, period, tabs } = usePeriodData<BatteryAnalytics>("battery");
  const days = (data?.days ?? []).map((d) => ({ ...d, label: dayLabel(d.date) }));
  const SRC_COLOR = ["#0ea5e9", "#f59e0b", "#10b981"];
  const maxSrc = Math.max(1, ...(data?.savingsBySource.map((s) => s.gbp) ?? [1]));

  return (
    <div>
      <PageHeader title="Battery Analytics" subtitle={`Cycles, savings and health — ${PERIOD_LABEL[period]}.`} right={tabs} />
      {error && <div className="mb-6"><ErrorBox /></div>}
      <KpiRow loading={!data} n={4}>
        {data && (
          <>
            <KpiCard label="Savings" value={`£${formatNumber(data.totals.savingsGbp)}`} icon={PoundSterling} tone="mint" />
            <KpiCard label="Cycles" value={formatNumber(data.totals.cycles)} icon={RefreshCw} tone="sky" caption={`${(data.totals.cycles / data.days.length).toFixed(2)} a day`} />
            <KpiCard label="Energy Delivered" value={formatNumber(data.totals.dischargedKwh)} unit="kWh" icon={Zap} tone="lavender" caption={`${formatNumber(data.totals.chargedKwh)} kWh charged`} />
            <KpiCard label="Round-trip Efficiency" value={`${data.totals.roundTripPct}%`} icon={Gauge} tone="peach" caption="Energy out vs energy in" />
          </>
        )}
      </KpiRow>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="Savings per Day" subtitle="£">
          {!data ? <Skeleton className="h-[240px]" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={days} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}`, "Saved"]} />
                <Bar dataKey="savingsGbp" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Where Savings Come From">
          {!data ? <Skeleton className="h-48" /> : (
            <div className="space-y-3">
              {data.savingsBySource.map((s, i) => (
                <div key={s.source}>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{s.source}</span><span className="font-semibold">£{formatNumber(s.gbp)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.gbp / maxSrc) * 100}%`, backgroundColor: SRC_COLOR[i] }} /></div>
                </div>
              ))}
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Time in each mode</div>
                {data.modeTime.map((mt) => (
                  <div key={mt.mode} className="flex justify-between text-sm py-0.5"><span className="text-muted-foreground">{mt.mode}</span><span className="font-medium">{mt.pct}%</span></div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Battery Health" subtitle="Usable capacity vs new, last 12 months">
        {!data ? <Skeleton className="h-[220px]" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.health} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis domain={["dataMin - 2", 100]} tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Health"]} />
              <Line type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><HeartPulse size={12} /> Most warranties guarantee 70–80% after 10 years.</div>
      </Panel>
    </div>
  );
}
