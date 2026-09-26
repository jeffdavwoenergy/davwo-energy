"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/shared/Panel";
import type { MapPin } from "@/components/map/EvMap";

const EvMap = dynamic(() => import("@/components/map/EvMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const LEGEND = [
  { label: "Operational", color: "#22c55e" },
  { label: "Attention", color: "#f59e0b" },
  { label: "Critical", color: "#ef4444" },
];

export default function MapPage() {
  const { data } = useSWR<MapPin[]>("/dashboard/map", fetcher, { refreshInterval: 60000 });
  const pins = data ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <PageHeader
        title="Network Map"
        subtitle="Live charge-point locations and status across the UK."
        status={data ? [{ label: "Sites", value: pins.length, dot: true }] : []}
        right={
          <div className="flex items-center gap-3">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        }
      />
      <div className="flex-1 rounded-2xl overflow-hidden border border-border shadow-sm">
        <EvMap pins={pins} />
      </div>
    </div>
  );
}
