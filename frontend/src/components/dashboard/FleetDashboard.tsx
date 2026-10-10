"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  Car, Bus, Truck, Navigation, CheckCircle2, AlertTriangle, BatteryCharging, Gauge, Wrench,
  MapPin, Clock, Thermometer, EyeOff, ShieldCheck, Plug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import VehicleCutaway, { COMPONENT_LABEL, SEVERITY_COLOR } from "@/components/fleet/VehicleCutaway";
import { FLEET_STATUS_COLOR, FLEET_STATUS_LABEL } from "@/components/map/FleetMap";
import DeviceSourceBadge from "@/components/dashboard/DeviceSourceBadge";
import type {
  FleetMonitor, FleetVehicle, VehicleComponent, VehicleKind, FaultSeverity,
} from "@/lib/deviceMonitoringTypes";

const FleetMap = dynamic(() => import("@/components/map/FleetMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const KIND_ICON: Record<VehicleKind, LucideIcon> = { car: Car, van: Truck, bus: Bus, truck: Truck };
const KIND_LABEL: Record<VehicleKind, string> = { car: "Car", van: "Van", bus: "Bus", truck: "Truck" };
const SEV_TONE: Record<FaultSeverity, "critical" | "warning" | "info"> = { critical: "critical", warning: "warning", info: "info" };
const SEV_RANK: Record<FaultSeverity, number> = { critical: 0, warning: 1, info: 2 };
const STATUS_TONE = { ready: "success", charging: "info", in_use: "neutral", idle: "neutral", fault: "critical" } as const;

/** Worst-first: critical faults, then warnings, then everything else. */
function urgency(v: FleetVehicle) {
  const worst = v.faults.reduce((m, f) => Math.min(m, SEV_RANK[f.severity]), 3);
  return worst * 1000 + (100 - v.socPct);
}

const ago = (iso: string) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
};

function VehicleList({ vehicles, selectedId, onSelect }: { vehicles: FleetVehicle[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-1.5 max-h-[560px] overflow-y-auto sidebar-scroll pr-1">
      {vehicles.map((v) => {
        const Icon = KIND_ICON[v.kind];
        const worst = v.faults.length ? [...v.faults].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0] : null;
        const active = v.id === selectedId;
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className={`w-full text-left p-3 rounded-xl border transition ${active ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500" : "border-border hover:bg-accent"}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: FLEET_STATUS_COLOR[v.status] }}>
                <Icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground truncate">{v.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1 py-0.5 shrink-0">{v.reg}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {FLEET_STATUS_LABEL[v.status]} · {v.socPct}% · {v.rangeMiles} mi
                </div>
              </div>
              {worst && (
                <span className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: SEVERITY_COLOR[worst.severity] }} title={worst.title}>
                  {v.faults.length}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Reading({ icon: Icon, label, value, warn }: { icon: LucideIcon; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400"><Icon size={12} /> {label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${warn ? "text-red-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function VehicleDiagnosticsPanel({ v }: { v: FleetVehicle }) {
  const [picked, setPicked] = useState<{ vehicle: string; component: VehicleComponent } | null>(null);
  const component = picked?.vehicle === v.id ? picked.component : null;
  const faults = [...v.faults].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const shown = component ? faults.filter((f) => f.component === component) : faults;
  const d = v.diagnostics;
  const Icon = KIND_ICON[v.kind];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy text-white shadow-sm">
      <div className="absolute inset-0 bg-map-dark" />
      <div className="absolute inset-0 bg-grain" />
      <div className="relative z-10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Icon size={22} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-display font-semibold">{v.name}</span>
                <span className="text-[11px] font-mono bg-white/10 rounded px-1.5 py-0.5">{v.reg}</span>
                <StatusPill tone={STATUS_TONE[v.status]}>{FLEET_STATUS_LABEL[v.status]}</StatusPill>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3 flex-wrap">
                <span>{KIND_LABEL[v.kind]} · {formatNumber(v.batteryKwh)} kWh</span>
                <span className="flex items-center gap-1">
                  {v.privateTrip ? <EyeOff size={12} /> : <MapPin size={12} />} {v.locationArea}
                </span>
                <span className="flex items-center gap-1"><Clock size={12} /> seen {v.lastSeenMins}m ago</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">Driver {v.driverId}</div>
        </div>

        <div className="mt-2 -mx-2">
          <VehicleCutaway
            kind={v.kind} faults={v.faults} diagnostics={d} socPct={v.socPct}
            pluggedIn={v.pluggedIn} charging={v.charging}
            selected={component}
            onSelect={(c) => setPicked(component === c ? null : { vehicle: v.id, component: c })}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <Reading icon={BatteryCharging} label="Charge" value={`${v.socPct}% · ${v.rangeMiles} mi`} warn={v.socPct < 20} />
          <Reading icon={Navigation} label="Speed" value={v.speedMph ? `${v.speedMph} mph` : "Parked"} />
          <Reading icon={Thermometer} label="Pack temp" value={`${d.batteryTempC}°C`} warn={d.batteryTempC > 38} />
          <Reading icon={Thermometer} label="Motor temp" value={`${d.motorTempC}°C`} warn={d.motorTempC > 110} />
          <Reading icon={Plug} label="12V battery" value={`${d.auxBatteryV} V`} warn={d.auxBatteryV < 12} />
          <Reading icon={Gauge} label="Brake pads" value={`${d.brakePadMm} mm`} warn={d.brakePadMm < 3} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {component ? COMPONENT_LABEL[component] : "What's wrong"}
            </div>
            {component && (
              <button onClick={() => setPicked(null)} className="text-xs text-emerald-300 hover:text-emerald-200">Show all faults</button>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-3 text-sm text-emerald-200">
              <ShieldCheck size={16} />
              {component ? `No faults on the ${COMPONENT_LABEL[component].toLowerCase()}.` : "No faults — all systems normal."}
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((f, i) => (
                <div key={f.code} className="rounded-xl bg-white/5 border px-4 py-3" style={{ borderColor: `${SEVERITY_COLOR[f.severity]}55` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!component && (
                      <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center" style={{ backgroundColor: SEVERITY_COLOR[f.severity] }}>{i + 1}</span>
                    )}
                    <span className="text-sm font-semibold">{f.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">{f.code}</span>
                    <StatusPill tone={SEV_TONE[f.severity]}>{f.severity}</StatusPill>
                    <span className="text-[11px] text-slate-400 ml-auto">{COMPONENT_LABEL[f.component]} · first seen {ago(f.firstSeen)}</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-1.5">{f.detail}</p>
                  <p className="text-sm mt-1 flex items-start gap-1.5 text-emerald-200"><Wrench size={14} className="mt-0.5 shrink-0" /> {f.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FleetDashboard() {
  const { data, error } = useSWR<FleetMonitor>("/monitoring/fleet", fetcher, { refreshInterval: 20000 });
  // ?vehicle=VH-003 (e.g. from an alert's "View vehicle") preselects it. Data
  // is fetched client-side, so reading the URL here can't cause a hydration mismatch.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("vehicle"),
  );

  const sorted = useMemo(() => (data ? [...data.vehicles].sort((a, b) => urgency(a) - urgency(b)) : []), [data]);
  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const onRoad = data?.vehicles.filter((v) => v.status === "in_use").length ?? 0;
  const privateTrips = data?.vehicles.filter((v) => v.privateTrip).length ?? 0;
  const allFaults = sorted.flatMap((v) => v.faults.map((f) => ({ v, f }))).sort((a, b) => SEV_RANK[a.f.severity] - SEV_RANK[b.f.severity]);
  const departures = [...(data?.vehicles ?? [])].sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));

  return (
    <div>
      <PageHeader
        title="Fleet Dashboard"
        subtitle="Where every vehicle is, what's wrong with it, and whether it'll be ready for its next job."
        right={data && <DeviceSourceBadge source={data.source} count={data.totalVehicles} noun="vehicle" />}
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="On the Road" value={`${onRoad}/${data.totalVehicles}`} icon={Navigation} tone="lavender" live caption={`${data.chargingCount} charging now`} />
            <KpiCard label="Ready by Departure" value={`${data.readyCount}/${data.totalVehicles}`} icon={CheckCircle2} tone="mint" />
            <KpiCard label="Faults to Fix" value={data.faultCounts.critical + data.faultCounts.warning} icon={AlertTriangle}
              tone={data.faultCounts.critical ? "peach" : "amber"} caption={`${data.faultCounts.critical} critical · ${data.faultCounts.warning} warning`} />
            <KpiCard label="Avg Charge" value={`${data.avgSocPct}%`} icon={BatteryCharging} tone="sky" caption={`${data.pluggedInCount} plugged in`} />
            <KpiCard label="Efficiency" value={data.avgEfficiencyMiPerKwh.toFixed(1)} unit="mi/kWh" icon={Gauge} tone="white" caption={`£${data.avgCostPerMileGbp.toFixed(2)}/mile`} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2">
          {!selected ? <Skeleton className="h-[640px]" /> : <VehicleDiagnosticsPanel v={selected} />}
        </div>
        <Panel title="Vehicles" subtitle="Most urgent first — pick one to inspect">
          {!data ? <Skeleton className="h-[520px]" /> : <VehicleList vehicles={sorted} selectedId={selected?.id ?? ""} onSelect={setSelectedId} />}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Live Fleet Map"
        subtitle={privateTrips ? `${privateTrips} vehicle${privateTrips > 1 ? "s are" : " is"} on a private trip — location hidden for driver privacy` : "Vehicle positions and depots"}
        right={
          <div className="hidden md:flex items-center gap-3">
            {(Object.keys(FLEET_STATUS_COLOR) as (keyof typeof FLEET_STATUS_COLOR)[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: FLEET_STATUS_COLOR[s] }} /> {FLEET_STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        }
      >
        <div className="h-[380px] rounded-2xl overflow-hidden border border-border">
          {data && <FleetMap vehicles={data.vehicles} depots={data.depots} selectedId={selected?.id ?? null} onSelect={setSelectedId} />}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Fleet Faults" subtitle="Every open fault, most severe first">
          {!data ? (
            <Skeleton className="h-40" />
          ) : allFaults.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No open faults across the fleet.</div>
          ) : (
            <div className="divide-y divide-border">
              {allFaults.map(({ v, f }) => (
                <button key={`${v.id}-${f.code}`} onClick={() => { setSelectedId(v.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-accent/60 rounded-lg px-2 -mx-2">
                  <StatusPill tone={SEV_TONE[f.severity]}>{f.severity}</StatusPill>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{f.title} <span className="text-[11px] font-mono text-muted-foreground">{f.code}</span></div>
                    <div className="text-xs text-muted-foreground truncate">{v.name} · {v.reg} · {COMPONENT_LABEL[f.component]}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Next Departures" subtitle="Will each vehicle have enough charge for its scheduled run?">
          {!data ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="divide-y divide-border max-h-[340px] overflow-y-auto sidebar-scroll pr-1">
              {departures.map((v) => (
                <div key={v.id} className="py-2.5 flex items-center gap-3">
                  <span className="text-sm font-mono font-semibold text-foreground w-12">{v.scheduledDeparture}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{v.name} <span className="text-[11px] font-mono text-muted-foreground">{v.reg}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${v.socPct < 20 ? "bg-red-500" : v.socPct < 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${v.socPct}%` }} />
                    </div>
                  </div>
                  {v.readyByDeparture ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0"><CheckCircle2 size={13} /> Ready</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600 shrink-0"><AlertTriangle size={13} /> {v.status === "fault" ? "Off road" : "At risk"}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
