"use client";

import useSWR from "swr";
import { ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Thermometer, Sun, CalendarClock } from "lucide-react";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import KpiCard from "@/components/shared/KpiCard";

interface ForecastPoint { time: string; value: number; lower: number; upper: number }
interface ForecastResp {
  horizon: string;
  confidence: number;
  peak_mwh: number;
  peak_time: string;
  drivers: string[];
  weather?: { temp_min_c: number; temp_max_c: number; peak_solar_wm2: number };
  points: ForecastPoint[];
  method: string;
  data_mode: string;
  data_sources: string[];
}

interface HorizonAccuracy { horizonDays: number; n: number; mae: number; mape: number | null; coveragePct: number }
interface NetworkBacktest { stationsEvaluated: number; overallByHorizon: HorizonAccuracy[] }

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

export default function ForecastingPage() {
  const { data, error } = useSWR<ForecastResp>("/forecasting?horizon=14d", fetcher, { refreshInterval: 300000 });
  const { data: accuracy } = useSWR<NetworkBacktest>("/ani/forecast-accuracy", fetcher);
  const chart = (data?.points ?? []).map((p) => ({ ...p, label: fmtDay(p.time) }));
  const accuracyChart = (accuracy?.overallByHorizon ?? []).map((h) => ({ ...h, label: `${h.horizonDays}d` }));

  return (
    <div>
      <PageHeader
        title="Forecasting"
        subtitle="ANI™ demand forecast — seasonal model × recent trend, with an 80% confidence band."
        right={data && <DataSourceBadge mode={data.data_mode} sources={data.data_sources} />}
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label="Forecast Peak" value={data.peak_mwh} unit="MWh" icon={TrendingUp} tone="mint" caption={data.peak_time ? fmtDay(data.peak_time) : ""} />
            <KpiCard label="Confidence" value={`${data.confidence}%`} icon={CalendarClock} tone="sky" caption={data.method.replaceAll("_", " ")} />
            <KpiCard label="Temp Range" value={data.weather ? `${data.weather.temp_min_c}–${data.weather.temp_max_c}` : "—"} unit="°C" icon={Thermometer} tone="lavender" live={!!data.weather} />
            <KpiCard label="Peak Solar" value={data.weather ? Math.round(data.weather.peak_solar_wm2) : "—"} unit="W/m²" icon={Sun} tone="amber" live={!!data.weather} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="14-Day Demand Forecast" subtitle="Network energy (MWh/day) with confidence band">
          {!data ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chart} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                {/* band: upper filled, lower masked to match the card background */}
                <Area type="monotone" dataKey="upper" stroke="none" fill="hsl(var(--chart-2))" fillOpacity={0.14} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--card))" fillOpacity={1} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Forecast Drivers" subtitle="Why ANI™ expects this demand">
          {!data ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <ul className="space-y-3">
              {data.drivers.map((d, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-sm text-foreground/80 leading-relaxed">{d}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Forecast Accuracy"
          subtitle={
            accuracy
              ? `Backtested against ${accuracy.stationsEvaluated} station${accuracy.stationsEvaluated === 1 ? "" : "s"}' actual history — how close ANI™'s forecast has really been, by lead time`
              : "Backtested against real historical outcomes — how close ANI™'s forecast has really been, by lead time"
          }
        >
          {!accuracy ? (
            <Skeleton className="h-[220px]" />
          ) : !accuracy.overallByHorizon.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Not enough history yet to backtest.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={accuracyChart} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} unit="%" />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }}
                      formatter={(v?: number) => [`${v ?? 0}%`, "Error"]}
                    />
                    <Bar dataKey="mape" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground text-center mt-1">Mean % error by days-ahead forecasted</p>
              </div>
              <div className="flex flex-col justify-center gap-3">
                {accuracyChart.map((h) => (
                  <div key={h.horizonDays} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                    <span className="text-foreground/80">{h.horizonDays}-day-ahead</span>
                    <span className="flex items-center gap-3">
                      <span className="text-muted-foreground">{h.mae} kWh MAE</span>
                      <span className="font-medium text-foreground">{h.coveragePct}% in band</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
