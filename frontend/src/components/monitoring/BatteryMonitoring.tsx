"use client";

import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { BatteryCharging, Zap, HeartPulse, PiggyBank, Plug, ShieldCheck, Gauge, RefreshCw, Power } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import type { BatteryMonitor } from "@/lib/deviceMonitoringTypes";

const MODE_LABEL = { "self-powered": "Self-powered", "time-based": "Time-based control", backup: "Backup-first" } as const;
const FLOW_LABEL = { charging: "Charging", discharging: "Discharging", idle: "Idle" } as const;

export function BatteryMonitoring() {
  const { data, error } = useSWR<BatteryMonitor>("/monitoring/battery", fetcher, { refreshInterval: 20000 });

  const flowTone = data?.flow === "charging" ? "success" : data?.flow === "discharging" ? "info" : "neutral";

  return (
    <div>
      <PageHeader
        title="Monitoring"
        subtitle="Live battery state of charge, power flow, backup reserve and savings."
        status={
          data
            ? [
                { label: "State of charge", value: `${data.avgSocPct}%`, dot: true },
                { label: "Grid", value: data.gridStatus === "connected" ? "Connected" : "Islanded" },
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
            <KpiCard label="Avg State of Charge" value={`${data.avgSocPct}%`} icon={BatteryCharging} tone="mint" live caption={`Reserve floor ${data.backupReservePct}%`} />
            <KpiCard label={FLOW_LABEL[data.flow]} value={formatNumber(Math.abs(data.netPowerKw))} unit="kW" icon={Zap} tone="sky" caption={data.flow === "idle" ? "Standby" : `${data.flow === "charging" ? "Storing" : "Supplying"} power`} />
            <KpiCard label="Battery Health" value={`${data.healthPct}%`} icon={HeartPulse} tone="lavender" caption={`${formatNumber(data.totalCycles)} cycles`} />
            <KpiCard label="Savings Today" value={`£${data.savingsTodayGbp.toFixed(2)}`} icon={PiggyBank} tone="peach" caption={`£${data.savingsMonthGbp.toFixed(2)} this month`} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="State of Charge & Power" subtitle="Last 24h — SoC (%) and charge/discharge power (kW)">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.curve} margin={{ left: -18, top: 8 }}>
                <defs>
                  <linearGradient id="socFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <ReferenceLine y={data.backupReservePct} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="soc" stroke="hsl(var(--chart-1))" fill="url(#socFill)" strokeWidth={2} name="SoC %" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Operating Status" subtitle="Mode, reserve & capacity">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><RefreshCw size={14} /> Operating mode</span>
                <StatusPill tone="info">{MODE_LABEL[data.operatingMode]}</StatusPill>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Power size={14} /> Grid status</span>
                <StatusPill tone={data.gridStatus === "connected" ? "success" : "warning"}>{data.gridStatus === "connected" ? "Connected" : "Islanded (backup)"}</StatusPill>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Plug size={14} /> Power flow</span>
                <StatusPill tone={flowTone}>{FLOW_LABEL[data.flow]} {data.flow !== "idle" ? `${formatNumber(Math.abs(data.netPowerKw))} kW` : ""}</StatusPill>
              </div>
              <Row label="Backup reserve" value={`${data.backupReservePct}%`} />
              <Row label="Usable capacity" value={`${formatNumber(data.usableCapacityKwh)} kWh`} />
              <Row label="Total capacity" value={`${formatNumber(data.totalCapacityKwh)} kWh`} />
              <Row label="Energy throughput (today)" value={`${formatNumber(data.throughputTodayKwh)} kWh`} />
              <Row label="Lifetime cycles" value={formatNumber(data.totalCycles)} />
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Battery Units" subtitle="Per-unit state of charge, power and health"
          right={data && <StatusPill tone="success"><ShieldCheck size={12} /> {data.units.filter((u) => u.status === "online").length}/{data.units.length} online</StatusPill>}>
          {!data ? (
            <Skeleton className="h-[160px]" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.units.map((u) => (
                <div key={u.id} className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{u.name}</span>
                    <StatusPill tone={u.status === "online" ? "success" : "warning"}>{u.status}</StatusPill>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-2xl font-display font-semibold text-foreground">{u.socPct}%</span>
                    <span className="text-xs text-muted-foreground">SoC</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${u.socPct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap size={12} /> {u.powerKw > 0 ? "+" : ""}{u.powerKw} kW</span>
                    <span className="flex items-center gap-1"><Gauge size={12} /> {u.capacityKwh} kWh</span>
                    <span className="flex items-center gap-1"><HeartPulse size={12} /> {u.healthPct}% health</span>
                    <span className="flex items-center gap-1"><RefreshCw size={12} /> {formatNumber(u.cycles)} cycles</span>
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
