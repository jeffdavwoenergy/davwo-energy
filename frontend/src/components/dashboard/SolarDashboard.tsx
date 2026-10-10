"use client";

import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Sun, Zap, Home, PoundSterling, Leaf, AlertTriangle, MapPin, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import DeviceSourceBadge from "@/components/dashboard/DeviceSourceBadge";
import type { SolarMonitor, SolarInverter } from "@/lib/deviceMonitoringTypes";

const STATUS_TONE = { online: "success", warning: "warning", offline: "critical" } as const;
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 };

/** One array drawn as a grid of panels, lit by how hard it's generating. */
function ArrayTile({ inv }: { inv: SolarInverter }) {
  const ratio = inv.capacityKwp ? Math.min(1, inv.acPowerKw / inv.capacityKwp) : 0;
  const cols = 8;
  const rows = 4;
  const fill = inv.status === "offline" ? "rgba(239,68,68,0.25)" : `rgba(56,189,248,${0.12 + ratio * 0.7})`;
  const stroke = inv.status === "offline" ? "#ef4444" : inv.status === "warning" ? "#f59e0b" : "rgba(148,210,255,0.5)";
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <svg viewBox="0 0 240 92" className="w-full h-auto" aria-hidden>
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => (
            <rect key={`${r}-${c}`} x={4 + c * 29} y={4 + r * 22} width={26} height={19} rx={2.5}
              fill={fill} stroke={stroke} strokeWidth={1} />
          )),
        )}
      </svg>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{inv.name}</div>
          <div className="text-[11px] text-slate-400 truncate flex items-center gap-1"><MapPin size={11} /> {inv.site} · {formatNumber(inv.capacityKwp)} kWp</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-display font-semibold">{formatNumber(inv.acPowerKw)} kW</div>
          <StatusPill tone={STATUS_TONE[inv.status]}>{inv.status}</StatusPill>
        </div>
      </div>
      {inv.faultCode && <div className="mt-1.5 text-[11px] text-amber-300 font-mono">Fault {inv.faultCode}</div>}
    </div>
  );
}

export default function SolarDashboard() {
  const { data, error } = useSWR<SolarMonitor>("/monitoring/solar", fetcher, { refreshInterval: 20000 });

  return (
    <div>
      <PageHeader
        title="Solar Dashboard"
        subtitle="What your arrays are generating, where the energy goes, and anything that needs attention."
        right={data && <DeviceSourceBadge source={data.source} count={data.inverters.length} noun="solar array" />}
      />
      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="Generating Now" value={formatNumber(data.currentGenerationKw)} unit="kW" icon={Sun} tone="amber" live caption={`of ${formatNumber(data.capacityKwp)} kWp installed`} />
            <KpiCard label="Generated Today" value={formatNumber(data.energyTodayKwh)} unit="kWh" icon={Zap} tone="mint" caption={`${data.specificYield} kWh per kWp`} />
            <KpiCard label="Used On Site" value={`${data.selfConsumedPct}%`} icon={Home} tone="sky" caption={`${formatNumber(data.exportedKwh)} kWh exported`} />
            <KpiCard label="Export Earnings" value={`£${data.exportEarningsTodayGbp.toFixed(2)}`} icon={PoundSterling} tone="lavender" caption={`£${formatNumber(data.exportEarningsMonthGbp)} this month`} />
            <KpiCard label="CO₂ Avoided" value={formatNumber(data.co2AvoidedKg)} unit="kg" icon={Leaf} tone="peach" caption="Today" />
          </>
        )}
      </div>

      <div className="mt-4 relative overflow-hidden rounded-2xl bg-navy text-white shadow-sm">
        <div className="absolute inset-0 bg-map-dark" />
        <div className="absolute inset-0 bg-grain" />
        <div className="relative z-10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1.5"><Sun size={14} /> Arrays right now</div>
              {data && <div className="text-sm text-slate-300 mt-0.5">Performance ratio {data.performanceRatioPct}% · brighter panels are generating harder</div>}
            </div>
            <Link href="/monitoring" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 flex items-center gap-1">
              Inverter detail <ArrowRight size={13} />
            </Link>
          </div>
          {!data ? (
            <Skeleton className="h-40 bg-white/10" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.inverters.map((inv) => <ArrayTile key={inv.id} inv={inv} />)}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel className="lg:col-span-2" title="Generation Today" subtitle="Actual vs expected for the weather, kW">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.curve} margin={{ left: -8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="solarActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={52} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="expected" name="Expected" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                <Area type="monotone" dataKey="actual" name="Actual" stroke="#f59e0b" strokeWidth={2} fill="url(#solarActual)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Where It Went" subtitle="Today's generation">
          {!data ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <div className="space-y-4">
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                <div className="bg-sky-500" style={{ width: `${data.selfConsumedPct}%` }} />
                <div className="bg-amber-400" style={{ width: `${data.exportedPct}%` }} />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Used on site</span>
                  <span className="font-semibold text-foreground">{formatNumber(data.selfConsumedKwh)} kWh</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Exported</span>
                  <span className="font-semibold text-foreground">{formatNumber(data.exportedKwh)} kWh</span>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Faults</div>
                {data.faults.length === 0 ? (
                  <div className="text-sm text-muted-foreground">All inverters healthy.</div>
                ) : (
                  data.faults.map((f) => (
                    <div key={f.inverterId} className="flex items-start gap-2 py-1.5">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <span className="font-medium text-foreground">{f.name}</span>{" "}
                        <span className="text-[11px] font-mono text-muted-foreground">{f.code}</span>
                        <div className="text-xs text-muted-foreground">{f.detail}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
