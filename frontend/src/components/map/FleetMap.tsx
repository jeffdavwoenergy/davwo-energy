"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import type { FleetVehicle, FleetStatus, LatLng } from "@/lib/deviceMonitoringTypes";

export const FLEET_STATUS_COLOR: Record<FleetStatus, string> = {
  ready: "#22c55e",
  charging: "#0ea5e9",
  in_use: "#8b5cf6",
  idle: "#64748b",
  fault: "#ef4444",
};
export const FLEET_STATUS_LABEL: Record<FleetStatus, string> = {
  ready: "Ready",
  charging: "Charging",
  in_use: "On the road",
  idle: "Idle",
  fault: "Fault",
};

/** Fits the map to the fleet once (and again only if the set of vehicles
 * changes) — the 20s position refresh must not keep yanking the view. */
function FitOnce({ points, signature }: { points: LatLng[]; signature: string }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!points.length || fitted.current === signature) return;
    fitted.current = signature;
    map.fitBounds(new LatLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 13 });
  }, [points, signature, map]);
  return null;
}

/** Pans to the selected vehicle when the selection changes. */
function FollowSelected({ target }: { target: LatLng | null }) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const key = `${target.lat},${target.lng}`;
    if (last.current === key) return;
    last.current = key;
    map.panTo([target.lat, target.lng], { animate: true });
  }, [target, map]);
  return null;
}

export default function FleetMap({
  vehicles, depots, selectedId, onSelect,
}: {
  vehicles: FleetVehicle[];
  depots: { name: string; location: LatLng }[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const located = vehicles.filter((v) => v.position);
  const points = [...located.map((v) => v.position!), ...depots.map((d) => d.location)];
  const selected = located.find((v) => v.id === selectedId) ?? null;

  return (
    <MapContainer center={[51.505, -0.15]} zoom={10} scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "1rem", zIndex: 0 }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitOnce points={points} signature={vehicles.map((v) => v.id).join("|")} />
      {selectedId !== undefined && <FollowSelected target={selected?.position ?? null} />}

      {depots.map((d) => (
        <CircleMarker key={`d-${d.name}`} center={[d.location.lat, d.location.lng]} radius={14}
          pathOptions={{ color: "#0f172a", weight: 2, dashArray: "4 4", fillColor: "#0f172a", fillOpacity: 0.08 }}>
          <Tooltip direction="top">{d.name} (depot)</Tooltip>
        </CircleMarker>
      ))}

      {located.map((v) => {
        const isSel = v.id === selectedId;
        const color = FLEET_STATUS_COLOR[v.status];
        return (
          <CircleMarker key={v.id} center={[v.position!.lat, v.position!.lng]} radius={isSel ? 11 : 7}
            eventHandlers={{ click: () => onSelect?.(v.id) }}
            pathOptions={{ color: isSel ? "#0f172a" : "#fff", weight: isSel ? 3 : 2, fillColor: color, fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              <div style={{ fontWeight: 600 }}>{v.name} · {v.reg}</div>
              <div>{FLEET_STATUS_LABEL[v.status]} · {v.socPct}%{v.speedMph ? ` · ${v.speedMph} mph` : ""}</div>
              {v.faults.length > 0 && <div style={{ color: "#dc2626" }}>{v.faults.length} fault{v.faults.length > 1 ? "s" : ""}</div>}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
