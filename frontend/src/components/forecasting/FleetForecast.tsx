"use client";

import { useState } from "react";
import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { BatteryCharging, PoundSterling, AlertTriangle, Wrench, Thermometer, CheckCircle2, Clock, Info } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import type { FleetForecast as FleetForecastData, ReadinessRow, MaintenanceItem } from "@/lib/server/deviceForecast";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
const RISK: Record<ReadinessRow["risk"], { tone: "success" | "warning" | "critical" | "neutral"; label: string }> = {
  ok: { tone: "success", label: "Ready" },
  tight: { tone: "warning", label: "Tight" },
  short: { tone: "critical", label: "Short" },
  off_road: { tone: "neutral", label: "Off road" },
};
const SEV = { high: "critical", medium: "warning", low: "info" } as const;
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function dueBucket(m: MaintenanceItem) {
  if (m.dueInDays === 0) return "Now";
  if (m.dueInDays <= 7) return "This week";
  if (m.dueInDays <= 31) return "This month";
  return "Later";
}

export default function FleetForecast() {
  const { data, error } = useSWR<FleetForecastData>("/forecasting/device?device=fleet", fetcher, { refreshInterval: 300000 });
  const [depot, setDepot] = useState<string | null>(null);
  const shownDepot = data?.depots.find((d) => d.depot === depot) ?? [...(data?.depots ?? [])].sort((a, b) => b.peakAsapKw - a.peakAsapKw)[0];
  const atRisk = data?.readiness.filter((r) => r.risk === "short" || r.risk === "tight").length ?? 0;
  const dueSoon = data?.maintenance.filter((m) => m.dueInDays <= 14).length ?? 0;
  const overLimit = data?.depots.filter((d) => d.peakAsapKw > d.limitKw) ?? [];
  const buckets = ["Now", "This week", "This month", "Later"].map((b) => ({ b, items: (data?.maintenance ?? []).filter((m) => dueBucket(m) === b) }));

  return (
    <div>
      <PageHeader
        title="Fleet Forecast"
        subtitle="Tonight's charging plan, tomorrow's readiness, and the maintenance coming up."
        right={data && (
          <div className="flex flex-wrap gap-2">
            <DataSourceBadge mode={data.source} sources={["Open-Meteo weather"]} />
            <DataSourceBadge mode={data.priceSource} sources={["Octopus Agile prices"]} />
          </div>
        )}
      />
      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="To Charge Tonight" value={formatNumber(data.totals.energyKwh)} unit="kWh" icon={BatteryCharging} tone="sky" caption={`${data.plan.length} vehicle${data.plan.length === 1 ? "" : "s"}`} />
            <KpiCard label="Smart Charging Saves" value={`£${data.totals.savingGbp.toFixed(2)}`} icon={PoundSterling} tone="mint"
              caption={`£${data.totals.costSmartGbp.toFixed(2)} vs £${data.totals.costAsapGbp.toFixed(2)} charging on arrival`} />
            <KpiCard label="At Risk Tomorrow" value={atRisk} icon={AlertTriangle} tone={atRisk ? "peach" : "white"} caption="Short or tight on charge" />
            <KpiCard label="Maintenance Due" value={dueSoon} icon={Wrench} tone="amber" caption="In the next 14 days" />
            <KpiCard label="Tomorrow's Low" value={data.tomorrow.tempMinC} unit="°C" icon={Thermometer} tone="lavender"
              caption={data.tomorrow.coldFactor > 1 ? `Range down ~${Math.round((1 - 1 / data.tomorrow.coldFactor) * 100)}% in the cold` : "No cold-weather range loss"} />
          </>
        )}
      </div>

      <Panel
        className="mt-4"
        title="Tonight's Charging Plan"
        subtitle={`Depot load if every vehicle charges on arrival vs ANI™'s plan — cheapest hours, kept under the ${data?.depotLimitKw ?? 150} kW supply`}
        right={data && data.depots.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {data.depots.map((d) => (
              <button key={d.depot} onClick={() => setDepot(d.depot)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${shownDepot?.depot === d.depot ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent"}`}>
                {d.depot}{d.peakAsapKw > d.limitKw ? " ⚠" : ""}
              </button>
            ))}
          </div>
        )}
      >
        {!data ? (
          <Skeleton className="h-[300px]" />
        ) : !shownDepot ? (
          <EmptyBox message="Every vehicle is already charged for tomorrow." />
        ) : (
          <>
            {overLimit.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Charging everything on arrival would overload {overLimit.map((d) => `${d.depot} (${d.peakAsapKw} kW)`).join(", ")}.
                  The plan staggers vehicles to stay within the supply.
                </span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={shownDepot.hours} margin={{ left: -8, right: 8, top: 8 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={2} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} unit=" kW" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v} kW`, n]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.pence ?? "–"}p/kWh`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={shownDepot.limitKw} stroke="#ef4444" strokeDasharray="6 4" label={{ value: `Supply ${shownDepot.limitKw} kW`, position: "insideTopRight", fontSize: 11, fill: "#ef4444" }} />
                <Bar dataKey="asap" name="Charge on arrival" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="smart" name="ANI™ plan" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} /> Supply limit assumed at {data.depotLimitKw} kW per depot — a typical small-depot connection.
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">Vehicle</th>
                    <th className="py-2 font-medium">Depot</th>
                    <th className="py-2 font-medium">Plugs in</th>
                    <th className="py-2 font-medium text-right">Needs</th>
                    <th className="py-2 font-medium">Charge</th>
                    <th className="py-2 font-medium">Leaves</th>
                    <th className="py-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plan.map((p) => (
                    <tr key={p.vehicleId} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 font-medium text-foreground">{p.name} <span className="text-[11px] font-mono text-muted-foreground">{p.reg}</span></td>
                      <td className="py-2.5 text-muted-foreground">{p.depot}</td>
                      <td className="py-2.5 text-muted-foreground">{p.plugIn}</td>
                      <td className="py-2.5 text-right text-foreground">{formatNumber(p.energyKwh)} kWh</td>
                      <td className="py-2.5">
                        {p.start ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><Clock size={12} /> {p.start}–{p.end}</span> : <span className="text-amber-600">Can&apos;t fit before departure</span>}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{p.departure}</td>
                      <td className="py-2.5 text-right">
                        <span className="font-semibold text-foreground">£{p.costSmartGbp.toFixed(2)}</span>
                        {p.costAsapGbp > p.costSmartGbp && <span className="text-[11px] text-muted-foreground line-through ml-1.5">£{p.costAsapGbp.toFixed(2)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Tomorrow's Readiness" subtitle={data ? `First runs on ${fmtDate(data.tomorrow.date)} — projected charge vs what the run needs` : undefined}>
          {!data ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto sidebar-scroll pr-1">
              {data.readiness.map((r) => (
                <div key={r.vehicleId}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{r.reg}</span>
                    <span className="text-[11px] text-muted-foreground">· {r.departure}</span>
                    <span className="ml-auto"><StatusPill tone={RISK[r.risk].tone}>{RISK[r.risk].label}</StatusPill></span>
                  </div>
                  {/* Bar = projected charge; the tick marks what the run needs. */}
                  <div className="relative mt-1.5 h-2 rounded-full bg-muted">
                    <div className={`h-full rounded-full ${r.risk === "short" ? "bg-red-500" : r.risk === "tight" ? "bg-amber-500" : r.risk === "off_road" ? "bg-slate-400" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, r.projectedPct)}%` }} />
                    <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${Math.min(100, r.neededPct)}%` }} title={`Needs ${r.neededPct}%`} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>{r.reason}</span>
                    <span className="shrink-0 ml-2">{r.projectedPct}% / needs {r.neededPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Upcoming Maintenance" subtitle="Predicted from each vehicle's wear rate and mileage">
          {!data ? (
            <Skeleton className="h-64" />
          ) : !data.maintenance.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 py-6 justify-center"><CheckCircle2 size={16} /> Nothing due in the next 90 days.</div>
          ) : (
            <div className="space-y-4 max-h-[460px] overflow-y-auto sidebar-scroll pr-1">
              {buckets.filter((b) => b.items.length).map(({ b, items }) => (
                <div key={b}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{b}</div>
                  <div className="divide-y divide-border">
                    {items.map((m, i) => (
                      <div key={`${m.vehicleId}-${m.item}-${i}`} className="py-2 flex items-start gap-3">
                        <StatusPill tone={SEV[m.severity]}>{m.item}</StatusPill>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground">{m.name} <span className="text-[11px] font-mono text-muted-foreground">{m.reg}</span></div>
                          <div className="text-[11px] text-muted-foreground">{m.basis}</div>
                        </div>
                        <div className="text-xs text-right shrink-0">
                          <div className="font-semibold text-foreground">{m.dueInDays === 0 ? "Now" : fmtDate(m.dueDate)}</div>
                          {m.dueInDays > 0 && <div className="text-muted-foreground">in {m.dueInDays} days</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
