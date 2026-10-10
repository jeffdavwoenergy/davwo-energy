"use client";

import useSWR from "swr";
import { ComposedChart, Bar, ErrorBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sun, CloudSun, Cloud, PoundSterling, Home, Sparkles, CalendarDays, CheckCircle2 } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import type { SolarForecast as SolarForecastData } from "@/lib/server/deviceForecast";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
const SkyIcon = ({ cloud }: { cloud: number }) => (cloud < 35 ? <Sun size={20} className="text-amber-500" /> : cloud < 70 ? <CloudSun size={20} className="text-amber-400" /> : <Cloud size={20} className="text-slate-400" />);

export default function SolarForecast() {
  const { data, error } = useSWR<SolarForecastData>("/forecasting/device?device=solar", fetcher, { refreshInterval: 1800000 });
  const chart = (data?.days ?? []).map((d) => ({ ...d, label: day(d.date), range: [d.kwh - d.low, d.high - d.kwh] }));

  return (
    <div>
      <PageHeader
        title="Solar Forecast"
        subtitle="Expected generation for the next 7 days from the weather forecast, and what it's worth."
        right={data && <DataSourceBadge mode={data.source} sources={["Open-Meteo weather"]} />}
      />
      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[130px]" />)
        ) : (
          <>
            <KpiCard label="Next 7 Days" value={formatNumber(data.weekKwh)} unit="kWh" icon={Sun} tone="amber" />
            <KpiCard label="Best Day" value={day(data.bestDay.date)} icon={CalendarDays} tone="mint" caption={`${formatNumber(data.bestDay.kwh)} kWh · worst ${day(data.worstDay.date)} ${formatNumber(data.worstDay.kwh)} kWh`} />
            <KpiCard label="Export Earnings" value={`£${data.weekExportGbp.toFixed(2)}`} icon={PoundSterling} tone="lavender" caption="This week, at 14p/kWh" />
            <KpiCard label="Used On Site" value={`£${data.weekSelfUseValueGbp.toFixed(2)}`} icon={Home} tone="sky" caption="Grid power you won't buy" />
          </>
        )}
      </div>

      <Panel className="mt-4" title="Daily Generation" subtitle="kWh per day — whiskers show the likely range, wider further out">
        {!data ? (
          <Skeleton className="h-[280px]" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chart} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n, p) => (n === "kwh" ? [`${v} kWh (${p.payload.low}–${p.payload.high})`, "Expected"] : [v, n])} />
                <Bar dataKey="kwh" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                  <ErrorBar dataKey="range" width={6} stroke="#92400e" strokeWidth={1.5} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-2">
              {data.days.map((d) => (
                <div key={d.date} className="rounded-xl border border-border px-2 py-2.5 text-center">
                  <div className="text-[11px] text-muted-foreground">{day(d.date)}</div>
                  <div className="flex justify-center my-1"><SkyIcon cloud={d.cloudPct} /></div>
                  <div className="text-sm font-semibold text-foreground">{formatNumber(d.kwh)}<span className="text-[10px] text-muted-foreground"> kWh</span></div>
                  <div className="text-[10px] text-muted-foreground">{d.cloudPct}% cloud · {d.tempMaxC}°</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel className="mt-4" title="Panel Cleaning" subtitle="Arrays producing less than the weather explains, and what that costs over the next week">
        {!data ? (
          <Skeleton className="h-24" />
        ) : !data.cleaning.length ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 py-4"><CheckCircle2 size={16} /> Every array is performing as expected — no cleaning needed.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.cleaning.map((c) => (
              <div key={c.name} className="py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Sparkles size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{c.name} <span className="text-xs text-muted-foreground">· {c.site}</span></div>
                  <div className="text-xs text-muted-foreground">Running at {c.performancePct}% of expected — book a clean</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-foreground">{formatNumber(c.lostKwhWeek)} kWh</div>
                  <div className="text-[11px] text-muted-foreground">≈ £{c.lostGbpWeek.toFixed(2)} lost this week</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
