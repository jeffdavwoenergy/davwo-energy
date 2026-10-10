"use client";

import useSWR from "swr";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BatteryCharging, Zap, PoundSterling, HeartPulse, ShieldCheck, MapPin } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import DeviceSourceBadge from "@/components/dashboard/DeviceSourceBadge";
import type { BatteryMonitor } from "@/lib/deviceMonitoringTypes";

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };
const MODE_LABEL = { "self-powered": "Self-powered", "time-based": "Time-based (cheap-rate)", backup: "Backup" } as const;

/** Energy-flow diagram: which way power is moving between solar, grid,
 * battery and the site right now. Lines animate in the direction of flow. */
function EnergyFlow({ data }: { data: BatteryMonitor }) {
  const daylight = (() => { const h = new Date().getHours(); return h >= 7 && h < 19; })();
  const kw = Math.abs(data.netPowerKw);
  // Each edge: from → to, active or not.
  const solarToBattery = data.flow === "charging" && daylight;
  const gridToBattery = data.flow === "charging" && !daylight;
  const batteryToSite = data.flow === "discharging";
  const gridToSite = data.flow !== "discharging";
  const nodes = {
    solar: { x: 300, y: 50, label: "Solar" },
    grid: { x: 80, y: 180, label: "Grid" },
    battery: { x: 300, y: 180, label: "Battery" },
    site: { x: 520, y: 180, label: "Site" },
  };
  const edge = (a: keyof typeof nodes, b: keyof typeof nodes, active: boolean, color: string) => {
    const p = nodes[a];
    const q = nodes[b];
    const pad = 52;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    const x1 = p.x + (dx / len) * pad;
    const y1 = p.y + (dy / len) * pad;
    const x2 = q.x - (dx / len) * pad;
    const y2 = q.y - (dy / len) * pad;
    const d = a === "grid" && b === "site" ? `M ${x1} ${y1 + 28} Q 300 ${330} ${x2} ${y2 + 28}` : `M ${x1} ${y1} L ${x2} ${y2}`;
    return (
      <path key={`${a}-${b}`} d={d} fill="none" stroke={active ? color : "rgba(148,210,255,0.15)"} strokeWidth={active ? 4 : 2}
        strokeDasharray={active ? "10 9" : "4 6"} strokeLinecap="round">
        {active && <animate attributeName="stroke-dashoffset" from="38" to="0" dur="1s" repeatCount="indefinite" />}
      </path>
    );
  };
  const soc = data.avgSocPct;
  const circ = 2 * Math.PI * 44;

  return (
    <svg viewBox="0 0 600 300" className="w-full h-auto" role="img" aria-label={`Battery ${data.flow}, ${soc}% charged`}>
      {edge("solar", "battery", solarToBattery, "#fbbf24")}
      {edge("grid", "battery", gridToBattery, "#38bdf8")}
      {edge("battery", "site", batteryToSite, "#34d399")}
      {edge("grid", "site", gridToSite, "#38bdf8")}

      {(["solar", "grid", "site"] as const).map((k) => (
        <g key={k}>
          <circle cx={nodes[k].x} cy={nodes[k].y} r={36} fill="rgba(15,23,42,0.85)" stroke="rgba(148,210,255,0.5)" strokeWidth={2} />
          <text x={nodes[k].x} y={nodes[k].y + 5} textAnchor="middle" fontSize={15} fontWeight={600} fill="#e2f0ff">{nodes[k].label}</text>
        </g>
      ))}

      <circle cx={300} cy={180} r={44} fill="rgba(15,23,42,0.9)" stroke="rgba(148,210,255,0.2)" strokeWidth={9} />
      <circle cx={300} cy={180} r={44} fill="none" stroke={soc < 20 ? "#ef4444" : soc < 50 ? "#f59e0b" : "#10b981"} strokeWidth={9}
        strokeDasharray={`${(soc / 100) * circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 300 180)" />
      <text x={300} y={180} textAnchor="middle" fontSize={22} fontWeight={700} fill="#fff">{soc}%</text>
      <text x={300} y={199} textAnchor="middle" fontSize={11} fill="#94a3b8">battery</text>

      <text x={300} y={268} textAnchor="middle" fontSize={14} fill="#cbd5e1">
        {data.flow === "charging" ? `Charging at ${kw} kW from ${daylight ? "solar" : "the grid (cheap rate)"}`
          : data.flow === "discharging" ? `Powering the site at ${kw} kW` : "Idle — site running from the grid"}
      </text>
    </svg>
  );
}

export default function BatteryDashboard() {
  const { data, error } = useSWR<BatteryMonitor>("/monitoring/battery", fetcher, { refreshInterval: 20000 });

  return (
    <div>
      <PageHeader
        title="Battery Dashboard"
        subtitle="How charged your storage is, where its power is going, and what it's saving you."
        right={data && <DeviceSourceBadge source={data.source} count={data.units.length} noun="battery" />}
      />
      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="Average Charge" value={`${data.avgSocPct}%`} icon={BatteryCharging} tone="mint" live caption={`${formatNumber(data.usableCapacityKwh)} kWh usable`} />
            <KpiCard label="Power Now" value={`${data.netPowerKw > 0 ? "+" : ""}${data.netPowerKw.toFixed(1)}`} unit="kW" icon={Zap} tone="sky"
              caption={data.flow === "idle" ? "Idle" : data.flow === "charging" ? "Charging" : "Discharging"} />
            <KpiCard label="Saved Today" value={`£${data.savingsTodayGbp.toFixed(2)}`} icon={PoundSterling} tone="lavender" caption={`£${formatNumber(data.savingsMonthGbp)} this month`} />
            <KpiCard label="Health" value={`${data.healthPct}%`} icon={HeartPulse} tone="peach" caption={`${formatNumber(data.totalCycles)} cycles`} />
            <KpiCard label="Backup Reserve" value={`${data.backupReservePct}%`} icon={ShieldCheck} tone="amber" caption={MODE_LABEL[data.operatingMode]} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-navy text-white shadow-sm">
          <div className="absolute inset-0 bg-map-dark" />
          <div className="absolute inset-0 bg-grain" />
          <div className="relative z-10 p-5">
            <div className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Energy flow right now</div>
            {!data ? <Skeleton className="h-64 mt-3 bg-white/10" /> : <EnergyFlow data={data} />}
          </div>
        </div>

        <Panel title="Units" subtitle="Charge, power and health per battery">
          {!data ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="space-y-2.5 max-h-[330px] overflow-y-auto sidebar-scroll pr-1">
              {data.units.map((u) => (
                <div key={u.id} className="p-3 rounded-xl border border-border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate"><MapPin size={11} /> {u.site} · {formatNumber(u.capacityKwh)} kWh</div>
                    </div>
                    <StatusPill tone={u.status === "online" ? "success" : u.status === "warning" ? "warning" : "critical"}>{u.status}</StatusPill>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${u.socPct < 20 ? "bg-red-500" : u.socPct < 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${u.socPct}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                    <span>{u.socPct}% · {u.powerKw > 0 ? "+" : ""}{u.powerKw} kW</span>
                    <span>{u.healthPct}% health · {formatNumber(u.cycles)} cycles</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Charge Level Today" subtitle="Average state of charge, %">
          {!data ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.curve} margin={{ left: -8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="batSoc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={3} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Charge"]} />
                <Area type="monotone" dataKey="soc" stroke="#10b981" strokeWidth={2} fill="url(#batSoc)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Charge & Discharge Today" subtitle="kW — above the line charging, below discharging">
          {!data ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.curve} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={3} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} kW`, "Power"]} />
                <Bar dataKey="power" radius={[4, 4, 4, 4]}>
                  {data.curve.map((p) => <Cell key={p.t} fill={p.power >= 0 ? "#0ea5e9" : "#10b981"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
