"use client";

import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sun, Zap, Leaf, Upload, Gauge, TrendingUp, AlertTriangle, ShieldCheck, Activity } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import type { SolarMonitor } from "@/lib/deviceMonitoringTypes";

const INV_TONE = { online: "success", warning: "warning", offline: "critical" } as const;

export function SolarMonitoring() {
  const { data, error } = useSWR<SolarMonitor>("/monitoring/solar", fetcher, { refreshInterval: 20000 });

  return (
    <div>
      <PageHeader
        title="Monitoring"
        subtitle="Live solar generation, self-consumption, export earnings and inverter health."
        status={
          data
            ? [
                { label: "Generating now", value: `${formatNumber(data.currentGenerationKw)} kW`, dot: true },
                { label: "As of", value: new Date(data.asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
              ]
            : []
        }
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="Current Generation" value={formatNumber(data.currentGenerationKw)} unit="kW" icon={Sun} tone="peach" live caption={`of ${formatNumber(data.capacityKwp)} kWp installed`} />
            <KpiCard label="Energy Today" value={formatNumber(data.energyTodayKwh)} unit="kWh" icon={Zap} tone="mint" caption={`${data.specificYield} kWh/kWp yield`} />
            <KpiCard label="Self-consumed" value={`${data.selfConsumedPct}%`} icon={Gauge} tone="lavender" caption={`${formatNumber(data.selfConsumedKwh)} kWh used on-site`} />
            <KpiCard label="Export Earnings (today)" value={`£${data.exportEarningsTodayGbp.toFixed(2)}`} icon={Upload} tone="sky" caption={`£${data.exportEarningsMonthGbp.toFixed(2)} this month`} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="Generation vs Expected" subtitle="Today, kW — ANI™ compares live output against the clear-sky model">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.curve} margin={{ left: -18, top: 8 }}>
                <defs>
                  <linearGradient id="solarActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <Area type="monotone" dataKey="expected" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="none" strokeWidth={1.5} name="Expected" />
                <Area type="monotone" dataKey="actual" stroke="hsl(var(--chart-1))" fill="url(#solarActual)" strokeWidth={2} name="Actual" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Performance" subtitle="Yield, ratio & environmental impact">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <div className="space-y-3">
              <Metric label="Performance ratio" value={`${data.performanceRatioPct}%`} hint="vs clear-sky expected" tone={data.performanceRatioPct >= 85 ? "success" : "warning"} />
              <Row label="Specific yield" value={`${data.specificYield} kWh/kWp`} />
              <Row label="Exported today" value={`${formatNumber(data.exportedKwh)} kWh (${data.exportedPct}%)`} />
              <Row label="Self-consumed" value={`${formatNumber(data.selfConsumedKwh)} kWh (${data.selfConsumedPct}%)`} />
              <Row label="Energy this month" value={`${formatNumber(data.energyMonthKwh)} kWh`} />
              <Row label="Lifetime energy" value={`${formatNumber(Math.round(data.energyLifetimeKwh / 1000))} MWh`} />
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Leaf size={14} className="text-emerald-600" /> CO₂ avoided today</span>
                <span className="text-sm font-semibold text-emerald-600">{formatNumber(data.co2AvoidedKg)} kg</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Inverter Status" subtitle="Per-inverter output, DC voltage and temperature"
          right={data && <StatusPill tone="info">{data.inverters.filter((i) => i.status === "online").length}/{data.inverters.length} online</StatusPill>}>
          {!data ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto sidebar-scroll pr-1">
              {data.inverters.map((inv) => (
                <div key={inv.id} className="p-3 rounded-xl border border-border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate">{inv.name}</span>
                      <StatusPill tone={INV_TONE[inv.status]}>{inv.status}</StatusPill>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0">{formatNumber(inv.acPowerKw)} kW</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span>DC {inv.dcVoltage} V</span>
                    <span>{inv.temperatureC}°C</span>
                    <span>{inv.strings.length} string{inv.strings.length > 1 ? "s" : ""}</span>
                    {inv.faultCode && <span className="text-amber-600 font-medium">{inv.faultCode}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Inverter Faults" subtitle="Active fault & error codes — ANI™ flags what needs intervention"
          right={data && data.faults.length > 0 && <StatusPill tone="warning">{data.faults.length} to review</StatusPill>}>
          {!data ? (
            <Skeleton className="h-[240px]" />
          ) : data.faults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2"><ShieldCheck size={24} /></div>
              <div className="text-sm font-semibold text-foreground">No active faults</div>
              <div className="text-xs text-muted-foreground">All inverters are generating normally.</div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto sidebar-scroll pr-1">
              {data.faults.map((f) => (
                <div key={f.inverterId} className="flex items-start gap-3 p-3 rounded-xl border border-border">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><AlertTriangle size={17} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{f.name}</span>
                      <StatusPill tone="warning">{f.code}</StatusPill>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(f.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "success" | "warning" }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-3">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xl font-display font-semibold text-foreground">{value}</span>
        <Activity size={14} className={tone === "success" ? "text-emerald-500" : "text-amber-500"} />
      </div>
    </div>
  );
}
