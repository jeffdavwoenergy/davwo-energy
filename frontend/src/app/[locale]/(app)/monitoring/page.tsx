"use client";

import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Activity, Plug, Gauge, Zap, AlertTriangle, WifiOff, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import { useDeviceType } from "@/lib/deviceType";
import { SolarMonitoring } from "@/components/monitoring/SolarMonitoring";
import { BatteryMonitoring } from "@/components/monitoring/BatteryMonitoring";
import { FleetMonitoring } from "@/components/monitoring/FleetMonitoring";

interface StationStatus {
  stationId: string;
  name: string;
  portsOnline: number;
  portsTotal: number;
  status: "healthy" | "degraded" | "down";
  currentUtilisation: number;
  currentLoadKw: number;
}
interface MonitorResult {
  asOf: string;
  stationsOnline: number;
  stationsTotal: number;
  stations: StationStatus[];
}

type FaultKind = "offline" | "degraded" | "recurring_fault";
interface Fault { stationId: string; name: string; kind: FaultKind; detail: string; fault_rate_pct: number; }
interface FaultSummary {
  asOf: string;
  rollup: { healthy: number; degraded: number; down: number; ports_online: number; ports_offline: number; faulted_ports_now: number };
  faults: Fault[];
}

const STATUS_TONE = { healthy: "success", degraded: "warning", down: "critical" } as const;
const BAR_COLOR = { healthy: "hsl(var(--chart-1))", degraded: "hsl(var(--chart-4))", down: "hsl(var(--destructive))" };
const FAULT_META: Record<FaultKind, { icon: LucideIcon; label: string; tone: "critical" | "warning" }> = {
  offline: { icon: WifiOff, label: "Offline", tone: "critical" },
  degraded: { icon: AlertTriangle, label: "Degraded", tone: "warning" },
  recurring_fault: { icon: Wrench, label: "Recurring fault", tone: "warning" },
};

export default function MonitoringPage() {
  const { device } = useDeviceType();
  if (device === "solar") return <SolarMonitoring />;
  if (device === "battery") return <BatteryMonitoring />;
  if (device === "fleet") return <FleetMonitoring />;
  return <EvMonitoring />;
}

function EvMonitoring() {
  const { data, error } = useSWR<MonitorResult>("/monitoring", fetcher, { refreshInterval: 20000 });
  const { data: fs } = useSWR<FaultSummary>("/monitoring/faults", fetcher, { refreshInterval: 20000 });

  const stations = data?.stations ?? [];
  const portsOnline = stations.reduce((s, x) => s + x.portsOnline, 0);
  const portsTotal = stations.reduce((s, x) => s + x.portsTotal, 0);
  const totalLoad = stations.reduce((s, x) => s + x.currentLoadKw, 0);
  const avgUtil = stations.length ? stations.reduce((s, x) => s + x.currentUtilisation, 0) / stations.length : 0;
  const chartData = stations.map((s) => ({ name: s.name.split(" ")[0], util: Math.round(s.currentUtilisation * 100), status: s.status }));

  return (
    <div>
      <PageHeader
        title="Monitoring"
        subtitle="Live station and port telemetry across the network."
        status={
          data
            ? [
                { label: "Stations online", value: `${data.stationsOnline}/${data.stationsTotal}`, dot: true },
                { label: "As of", value: new Date(data.asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
              ]
            : []
        }
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label="Stations Online" value={`${data.stationsOnline}/${data.stationsTotal}`} icon={Activity} tone="mint" />
            <KpiCard label="Ports Online" value={`${portsOnline}/${portsTotal}`} icon={Plug} tone="sky" />
            <KpiCard label="Avg Utilisation" value={`${Math.round(avgUtil * 100)}%`} icon={Gauge} tone="lavender" />
            <KpiCard label="Current Load" value={formatNumber(totalLoad)} unit="kW" icon={Zap} tone="peach" />
          </>
        )}
      </div>

      {/* Online/offline rollup + fault detection */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-1" title="Network status" subtitle="Live station & port rollup">
          {!fs ? (
            <Skeleton className="h-[200px]" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Rollup label="Healthy" value={fs.rollup.healthy} icon={ShieldCheck} tone="text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15" />
                <Rollup label="Degraded" value={fs.rollup.degraded} icon={AlertTriangle} tone="text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15" />
                <Rollup label="Down" value={fs.rollup.down} icon={WifiOff} tone="text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15" />
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Ports online</span>
                <span className="font-semibold text-foreground">{fs.rollup.ports_online} <span className="text-muted-foreground font-normal">/ {fs.rollup.ports_online + fs.rollup.ports_offline}</span></span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ports offline</span>
                <span className={`font-semibold ${fs.rollup.ports_offline ? "text-red-600" : "text-foreground"}`}>{fs.rollup.ports_offline}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Faulted right now</span>
                <span className={`font-semibold ${fs.rollup.faulted_ports_now ? "text-amber-600" : "text-foreground"}`}>{fs.rollup.faulted_ports_now}</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Fault Detection" subtitle="Offline, degraded and recurring faults — ANI™ flags what needs intervention"
          right={fs && fs.faults.length > 0 && <StatusPill tone="warning">{fs.faults.length} to review</StatusPill>}>
          {!fs ? (
            <Skeleton className="h-[200px]" />
          ) : fs.faults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-2"><ShieldCheck size={24} /></div>
              <div className="text-sm font-semibold text-foreground">No active faults</div>
              <div className="text-xs text-muted-foreground">Every station is healthy across the network.</div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto sidebar-scroll pr-1">
              {fs.faults.map((f) => {
                const meta = FAULT_META[f.kind];
                const Icon = meta.icon;
                return (
                  <div key={f.stationId} className="flex items-start gap-3 p-3 rounded-xl border border-border">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.tone === "critical" ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"}`}>
                      <Icon size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{f.name}</span>
                        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {f.detail}{f.fault_rate_pct > 0 ? ` · ${f.fault_rate_pct}% fault rate (24h)` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Utilisation by Station" subtitle="Current hour, % of capacity">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ left: -18, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} unit="%" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} cursor={{ fill: "hsl(var(--accent))" }} />
                <Bar dataKey="util" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={BAR_COLOR[d.status]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Station Health" subtitle="Port availability and load per site">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto sidebar-scroll pr-1">
              {stations.map((s) => (
                <div key={s.stationId} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{s.name}</span>
                      <StatusPill tone={STATUS_TONE[s.status]}>{s.status}</StatusPill>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(s.currentUtilisation * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-foreground">{s.portsOnline}/{s.portsTotal}</div>
                    <div className="text-[11px] text-muted-foreground">{formatNumber(s.currentLoadKw)} kW</div>
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

function Rollup({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: string }) {
  return (
    <div className="rounded-xl border border-border p-3 text-center">
      <div className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center ${tone}`}><Icon size={16} /></div>
      <div className="text-xl font-semibold text-foreground mt-1.5 font-display">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
