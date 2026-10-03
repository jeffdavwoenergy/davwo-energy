"use client";

import useSWR from "swr";
import { Car, BatteryCharging, Plug, Gauge, MapPin, Clock, CheckCircle2, AlertTriangle, Wallet, Route } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import type { FleetMonitor, FleetStatus } from "@/lib/deviceMonitoringTypes";

const STATUS_TONE: Record<FleetStatus, "success" | "info" | "warning" | "critical" | "neutral"> = {
  ready: "success",
  charging: "info",
  in_use: "neutral",
  idle: "neutral",
  fault: "critical",
};
const STATUS_LABEL: Record<FleetStatus, string> = {
  ready: "Ready",
  charging: "Charging",
  in_use: "In use",
  idle: "Idle",
  fault: "Fault",
};

export function FleetMonitoring() {
  const { data, error } = useSWR<FleetMonitor>("/monitoring/fleet", fetcher, { refreshInterval: 20000 });

  return (
    <div>
      <PageHeader
        title="Monitoring"
        subtitle="Live fleet state of charge, readiness, efficiency and driver reimbursement."
        status={
          data
            ? [
                { label: "Ready by departure", value: `${data.readyCount}/${data.totalVehicles}`, dot: true },
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
            <KpiCard label="Ready by Departure" value={`${data.readyCount}/${data.totalVehicles}`} icon={CheckCircle2} tone="mint" live caption="Meeting scheduled departure" />
            <KpiCard label="Avg State of Charge" value={`${data.avgSocPct}%`} icon={BatteryCharging} tone="sky" caption={`${data.pluggedInCount} plugged in · ${data.chargingCount} charging`} />
            <KpiCard label="Avg Efficiency" value={formatNumber(data.avgEfficiencyMiPerKwh)} unit="mi/kWh" icon={Gauge} tone="lavender" caption={`£${data.avgCostPerMileGbp.toFixed(2)}/mile avg`} />
            <KpiCard label="Fleet Health" value={`${data.fleetHealthPct}%`} icon={Route} tone="peach" caption={`${data.totalVehicles} vehicles`} />
          </>
        )}
      </div>

      <div className="mt-4">
        <Panel title="Vehicles" subtitle="State of charge, range, readiness and location (area-level only for privacy)">
          {!data ? (
            <Skeleton className="h-[320px]" />
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto sidebar-scroll pr-1">
              {data.vehicles.map((v) => (
                <div key={v.id} className="p-3.5 rounded-xl border border-border">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{v.name}</span>
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{v.reg}</span>
                        <StatusPill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</StatusPill>
                        {v.pluggedIn && <StatusPill tone={v.charging ? "info" : "neutral"}><Plug size={11} /> {v.charging ? "Charging" : "Plugged in"}</StatusPill>}
                      </div>
                      <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {v.locationArea}</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {v.lastSeenMins}m ago</span>
                        <span>{v.driverId}</span>
                        <span>{formatNumber(v.odometerMiles)} mi</span>
                        <span>{v.milesPerKwh} mi/kWh · £{v.costPerMileGbp.toFixed(2)}/mi</span>
                        <span>{v.batteryHealthPct}% health</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-display font-semibold text-foreground">{v.socPct}%</div>
                      <div className="text-[11px] text-muted-foreground">{v.rangeMiles} mi range</div>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${v.socPct < 20 ? "bg-red-500" : v.socPct < 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${v.socPct}%` }} />
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    {v.readyByDeparture ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 size={12} /> Ready by {v.scheduledDeparture}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 font-medium"><AlertTriangle size={12} /> Won&rsquo;t meet {v.scheduledDeparture} departure</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Home Charging Reimbursement" subtitle="Per-driver home-charged energy and reimbursement (home addresses masked)"
          right={data && <StatusPill tone="info"><Wallet size={12} /> {data.reimbursements.length} drivers</StatusPill>}>
          {!data ? (
            <Skeleton className="h-[160px]" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">Driver</th>
                    <th className="py-2 font-medium text-right">Sessions</th>
                    <th className="py-2 font-medium text-right">Home energy</th>
                    <th className="py-2 font-medium text-right">Reimbursement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reimbursements.map((d) => (
                    <tr key={d.driverId} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 font-medium text-foreground flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-foreground">{d.driverId.slice(-3)}</span>
                        {d.driverId}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">{d.sessions}</td>
                      <td className="py-2.5 text-right text-foreground">{formatNumber(d.homeEnergyKwh)} kWh</td>
                      <td className="py-2.5 text-right font-semibold text-emerald-600">£{d.reimbursementGbp.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
