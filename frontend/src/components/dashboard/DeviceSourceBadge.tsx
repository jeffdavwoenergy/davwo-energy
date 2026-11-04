"use client";

import { Link } from "@/i18n/navigation";
import StatusPill from "@/components/shared/StatusPill";
import type { MonitorSource } from "@/lib/deviceMonitoringTypes";

/** Says whether a device dashboard shows real integrated telemetry, the org's
 * own registered devices, or the demo set — with a nudge to Assets when it's
 * demo data. */
export default function DeviceSourceBadge({ source, count, noun }: { source: MonitorSource; count: number; noun: string }) {
  if (source === "live" && count === 0) {
    return (
      <div className="flex items-center gap-2">
        <StatusPill tone="neutral">No {noun}s connected</StatusPill>
        <Link href="/assets?connect=1" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 whitespace-nowrap">
          Connect a platform →
        </Link>
      </div>
    );
  }
  if (source === "live") {
    return <StatusPill tone="success">Live · {count} real {noun}{count === 1 ? "" : "s"}</StatusPill>;
  }
  if (source === "assets") {
    return <StatusPill tone="success">Your {count} {noun}{count === 1 ? "" : "s"}</StatusPill>;
  }
  return (
    <div className="flex items-center gap-2">
      <StatusPill tone="neutral">Demo data</StatusPill>
      <Link href="/assets" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 whitespace-nowrap">
        Add your {noun}s →
      </Link>
    </div>
  );
}
