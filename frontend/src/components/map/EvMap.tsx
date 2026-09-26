"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";

export interface MapPin {
  site: string;
  lat: number;
  lng: number;
  status: string;
  active_sessions?: number;
}

const STATUS_COLOR: Record<string, string> = {
  operational: "#22c55e",
  healthy: "#22c55e",
  warning: "#f59e0b",
  degraded: "#f59e0b",
  critical: "#ef4444",
  down: "#ef4444",
};
const colorFor = (s: string) => STATUS_COLOR[s] ?? "#64748b";

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (!pins.length) return;
    const bounds = new LatLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [pins, map]);
  return null;
}

export default function EvMap({ pins }: { pins: MapPin[] }) {
  return (
    <MapContainer
      center={[53.5, -1.5]}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "1rem", zIndex: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitBounds pins={pins} />
      {pins.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lng]}
          radius={8}
          pathOptions={{ color: colorFor(p.status), fillColor: colorFor(p.status), fillOpacity: 0.7, weight: 2 }}
        >
          <Popup>
            <div style={{ fontWeight: 600 }}>{p.site}</div>
            <div style={{ textTransform: "capitalize" }}>Status: {p.status}</div>
            {p.active_sessions != null && p.active_sessions > 0 && <div>{p.active_sessions} active sessions</div>}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
