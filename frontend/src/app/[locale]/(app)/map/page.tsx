"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/shared/Panel";
import type { MapPin } from "@/components/map/EvMap";
import { FLEET_STATUS_COLOR, FLEET_STATUS_LABEL } from "@/components/map/FleetMap";
import { useDeviceType } from "@/lib/deviceType";
import type { FleetMonitor, SolarMonitor, BatteryMonitor } from "@/lib/deviceMonitoringTypes";

const EvMap = dynamic(() => import("@/components/map/EvMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});
const FleetMap = dynamic(() => import("@/components/map/FleetMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const LEGEND = [
  { label: "Operational", color: "#22c55e" },
  { label: "Attention", color: "#f59e0b" },
  { label: "Critical", color: "#ef4444" },
];
const DEVICE_STATUS: Record<string, string> = { online: "operational", warning: "warning", offline: "critical" };

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

function MapShell({ title, subtitle, status, legend, children }: {
  title: string; subtitle: string; status: { label: string; value: React.ReactNode; dot?: boolean }[];
  legend: { label: string; color: string }[]; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <PageHeader title={title} subtitle={subtitle} status={status} right={<Legend items={legend} />} />
      <div className="flex-1 rounded-2xl overflow-hidden border border-border shadow-sm">{children}</div>
    </div>
  );
}

function FleetMapPage() {
  const { data } = useSWR<FleetMonitor>("/monitoring/fleet", fetcher, { refreshInterval: 20000 });
  const hidden = data?.vehicles.filter((v) => v.privateTrip).length ?? 0;
  return (
    <MapShell
      title="Fleet Map"
      subtitle={`Live vehicle positions and depots${hidden ? ` · ${hidden} on a private trip (location hidden)` : ""}.`}
      status={data ? [{ label: "Vehicles", value: data.totalVehicles, dot: true }, { label: "Depots", value: data.depots.length }] : []}
      legend={(Object.keys(FLEET_STATUS_COLOR) as (keyof typeof FLEET_STATUS_COLOR)[]).map((s) => ({ label: FLEET_STATUS_LABEL[s], color: FLEET_STATUS_COLOR[s] }))}
    >
      {data ? <FleetMap vehicles={data.vehicles} depots={data.depots} /> : <Skeleton className="h-full w-full" />}
    </MapShell>
  );
}

function SiteMapPage({ kind }: { kind: "solar" | "battery" }) {
  const solar = useSWR<SolarMonitor>(kind === "solar" ? "/monitoring/solar" : null, fetcher, { refreshInterval: 60000 });
  const battery = useSWR<BatteryMonitor>(kind === "battery" ? "/monitoring/battery" : null, fetcher, { refreshInterval: 60000 });
  const pins: MapPin[] | undefined = kind === "solar"
    ? solar.data?.inverters.map((i) => ({ site: `${i.name} · ${i.site} (${i.acPowerKw} kW)`, lat: i.location.lat, lng: i.location.lng, status: DEVICE_STATUS[i.status] }))
    : battery.data?.units.map((u) => ({ site: `${u.name} · ${u.site} (${u.socPct}%)`, lat: u.location.lat, lng: u.location.lng, status: DEVICE_STATUS[u.status] }));
  return (
    <MapShell
      title={kind === "solar" ? "Solar Map" : "Battery Map"}
      subtitle={kind === "solar" ? "Where your solar arrays are and how they're performing." : "Where your batteries are and how charged they are."}
      status={pins ? [{ label: kind === "solar" ? "Arrays" : "Batteries", value: pins.length, dot: true }] : []}
      legend={LEGEND}
    >
      {pins ? <EvMap pins={pins} /> : <Skeleton className="h-full w-full" />}
    </MapShell>
  );
}

function ChargerMapPage() {
  const { data } = useSWR<MapPin[]>("/dashboard/map", fetcher, { refreshInterval: 60000 });
  const pins = data ?? [];
  return (
    <MapShell
      title="Network Map"
      subtitle="Live charge-point locations and status across the UK."
      status={data ? [{ label: "Sites", value: pins.length, dot: true }] : []}
      legend={LEGEND}
    >
      <EvMap pins={pins} />
    </MapShell>
  );
}

/** Follows the Energy Devices switcher. */
export default function MapPage() {
  const { device } = useDeviceType();
  if (device === "fleet") return <FleetMapPage />;
  if (device === "solar" || device === "battery") return <SiteMapPage kind={device} />;
  return <ChargerMapPage />;
}
