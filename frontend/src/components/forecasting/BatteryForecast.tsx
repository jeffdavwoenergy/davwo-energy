"use client";

import useSWR from "swr";
import { BarChart, Bar, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { PoundSterling, ArrowDownToLine, ArrowUpFromLine, HeartPulse } from "lucide-react";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import type { BatteryForecast as BatteryForecastData } from "@/lib/server/deviceForecast";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
const ACTION_COLOR = { charge: "#0ea5e9", discharge: "#10b981", hold: "#cbd5e1" } as const;
const ACTION_LABEL = { charge: "Charge", discharge: "Discharge", hold: "Hold" } as const;
const t = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function BatteryForecast() {
  const { data, error } = useSWR<BatteryForecastData>("/forecasting/device?device=battery", fetcher, { refreshInterval: 900000 });
  const slots = (data?.slots ?? []).map((s) => ({ ...s, label: t(s.time) }));

  return (
    <div>
      <PageHeader
        title="Battery Forecast"
        subtitle="ANI™'s plan for the next 24 hours: charge when power is cheapest, discharge at the peak."
        right={data && <DataSourceBadge mode={data.source} sources={["Octopus Agile prices"]} />}
      />
      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[130px]" />)
        ) : (
          <>
            <KpiCard label="Planned Saving" value={`£${data.savingGbp.toFixed(2)}`} icon={PoundSterling} tone="mint" caption="Next 24 hours vs leaving it idle" />
            <KpiCard label="Charge" value={data.chargeWindow ?? "Not needed"} icon={ArrowDownToLine} tone="sky" caption={`${data.chargeKwh} kWh from the grid`} />
            <KpiCard label="Discharge" value={data.dischargeWindow ?? "Not worth it"} icon={ArrowUpFromLine} tone="lavender" caption={`${data.dischargeKwh} kWh to the site`} />
            <KpiCard label="Reaches 80% Health" value={data.health.reaches80 ?? "—"} icon={HeartPulse} tone="peach"
              caption={data.health.yearsTo80 != null ? `~${data.health.yearsTo80} years at ${data.health.fadePctPerYear}%/yr` : "Already below 80%"} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Price & Plan" subtitle="p/kWh per half-hour, coloured by what the battery will do">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={slots} margin={{ left: -8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, _n, p) => [`${v}p/kWh — ${ACTION_LABEL[p.payload.action as keyof typeof ACTION_LABEL]}`, "Price"]} />
                  <Bar dataKey="pence" radius={[3, 3, 0, 0]}>
                    {slots.map((s) => <Cell key={s.time} fill={ACTION_COLOR[s.action]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                {(Object.keys(ACTION_COLOR) as (keyof typeof ACTION_COLOR)[]).map((a) => (
                  <span key={a} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ACTION_COLOR[a] }} /> {ACTION_LABEL[a]}</span>
                ))}
              </div>
            </>
          )}
        </Panel>
        <Panel title="Charge Level" subtitle="Projected state of charge through the plan, %">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={262}>
              <AreaChart data={slots} margin={{ left: -8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fcSoc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Charge"]} />
                <Area type="stepAfter" dataKey="socPct" stroke="#10b981" strokeWidth={2} fill="url(#fcSoc)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
