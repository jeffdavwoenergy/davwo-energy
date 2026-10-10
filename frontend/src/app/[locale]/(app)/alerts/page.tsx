"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle, TrendingUp, BatteryLow, Wrench, Lightbulb, Check, CheckCheck, Zap, Sun, BatteryCharging, Truck,
  Boxes, Route, PoundSterling, Gauge, SunDim, ArrowUpFromLine, SlidersHorizontal, HeartPulse, ShieldCheck,
  ChevronDown, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { useDeviceType, DEVICES, type DeviceType } from "@/lib/deviceType";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";

interface Insight {
  type: string;
  severity: "high" | "medium" | "low" | "info";
  asset: string;
  metric: { name: string; value: number; window: string };
  recommendation: string;
  confidence: number;
  why: string;
}
interface Alert {
  id: string;
  severity: "high" | "medium" | "low";
  status: "active" | "acknowledged" | "resolved";
  title: string;
  asset: string;
  site: string;
  created_at: string;
  device?: DeviceType;
  detail?: string;
  action?: string;
  href?: string;
}

const STATUS_FILTERS: { value: "" | Alert["status"]; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

const SEV_TONE = { high: "critical", medium: "warning", low: "info", info: "neutral" } as const;
const DEVICE_ICON: Record<DeviceType, LucideIcon> = { ev: Zap, solar: Sun, battery: BatteryCharging, fleet: Truck };
const TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  capacity_risk: { icon: AlertTriangle, label: "Capacity risk" },
  rising_demand: { icon: TrendingUp, label: "Rising demand" },
  underutilised: { icon: BatteryLow, label: "Underutilised" },
  recurring_fault: { icon: Wrench, label: "Recurring fault" },
  range_risk: { icon: Route, label: "Readiness risk" },
  charging_cost: { icon: PoundSterling, label: "Charging cost" },
  maintenance: { icon: Wrench, label: "Maintenance" },
  efficiency: { icon: Gauge, label: "Efficiency" },
  underperformance: { icon: SunDim, label: "Underperforming" },
  export: { icon: ArrowUpFromLine, label: "Export" },
  mode: { icon: SlidersHorizontal, label: "Operating mode" },
  reserve: { icon: ShieldCheck, label: "Backup reserve" },
  health: { icon: HeartPulse, label: "Battery health" },
};
const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function InsightCard({ ins }: { ins: Insight }) {
  const meta = TYPE_META[ins.type] ?? { icon: Lightbulb, label: ins.type };
  const Icon = meta.icon;
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-foreground shrink-0">
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill tone={SEV_TONE[ins.severity]}>{ins.severity}</StatusPill>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{meta.label}</span>
            <span className="text-xs text-muted-foreground">· {Math.round(ins.confidence * 100)}% confidence</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-foreground">{ins.asset}</div>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{ins.why}</p>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
            <Lightbulb size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">{ins.recommendation}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function AlertsPage() {
  const { device, setDevice } = useDeviceType();
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | Alert["status"]>("");
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const tab: DeviceType | null = showAll ? null : device;
  const deviceMeta = DEVICES.find((d) => d.id === device)!;

  const insights = useSWR<Insight[]>(`/ani/insights${device === "ev" ? "" : `?device=${device}`}`, fetcher, { refreshInterval: 60000 });
  // One fetch for every device — the tabs and their counts filter client-side.
  const alerts = useSWR<Alert[]>(`/alerts${statusFilter ? `?status=${statusFilter}` : ""}`, fetcher, { refreshInterval: 60000 });
  const all = alerts.data ?? [];
  const list = (tab ? all.filter((a) => (a.device ?? "ev") === tab) : all)
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
  const active = list.filter((a) => a.status === "active");
  const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  active.forEach((a) => (counts[a.severity] += 1));

  const act = async (id: string, action: "acknowledge" | "resolve") => {
    setPending(id);
    try {
      await api.post(`/alerts/${id}/${action}`);
      await alerts.mutate();
      toast.success(action === "acknowledge" ? "Alert acknowledged" : "Alert resolved");
    } catch {
      toast.error("Could not update the alert — please try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Alerts & Insights"
        subtitle="What needs attention across your devices, and ANI™'s explained recommendations."
        status={alerts.data ? [
          { label: "High", value: counts.high },
          { label: "Medium", value: counts.medium },
          { label: "Low", value: counts.low },
        ] : []}
      />

      {/* Device tabs — follow (and drive) the Energy Devices switcher. */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        <button onClick={() => setShowAll(true)}
          className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition ${!tab ? "bg-emerald-600 border-emerald-600 text-white" : "bg-card border-border text-foreground hover:bg-accent"}`}>
          <Boxes size={15} /> All devices
          <span className={`text-[11px] rounded-full px-1.5 ${!tab ? "bg-white/20" : "bg-muted"}`}>{all.filter((a) => a.status === "active").length}</span>
        </button>
        {DEVICES.map((d) => {
          const Icon = DEVICE_ICON[d.id];
          const isActive = tab === d.id;
          const n = all.filter((a) => (a.device ?? "ev") === d.id && a.status === "active").length;
          return (
            <button key={d.id} onClick={() => { setShowAll(false); setDevice(d.id); }}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition ${isActive ? "bg-emerald-600 border-emerald-600 text-white" : "bg-card border-border text-foreground hover:bg-accent"}`}>
              <Icon size={15} /> {d.label}
              <span className={`text-[11px] rounded-full px-1.5 ${isActive ? "bg-white/20" : n ? "bg-red-50 text-red-700" : "bg-muted"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {(insights.error || alerts.error) && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb size={16} className="text-emerald-600" /> ANI™ Insights · {deviceMeta.label}
          </div>
          {!insights.data ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : !insights.data.length ? (
            <Panel><EmptyBox message={`Nothing to flag for your ${deviceMeta.label.toLowerCase()} right now.`} /></Panel>
          ) : (
            insights.data.map((ins, i) => <InsightCard key={i} ins={ins} />)
          )}
        </div>

        <Panel
          className="lg:col-span-3"
          title={tab ? `${deviceMeta.label} alerts` : "All alerts"}
          subtitle="Most severe first — open one for what's wrong and what to do"
          bodyClassName="p-0"
          right={
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value || "all"}
                  onClick={() => setStatusFilter(f.value)}
                  variant={statusFilter === f.value ? "default" : "outline"}
                  size="sm"
                  className="h-auto rounded-full px-2.5 py-1 text-[11px] font-medium"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          }
        >
          {!alerts.data ? (
            <div className="p-5"><Skeleton className="h-40" /></div>
          ) : !list.length ? (
            <EmptyBox message="No alerts match this filter." />
          ) : (
            <div className="divide-y divide-border">
              {list.map((a) => {
                const Icon = DEVICE_ICON[a.device ?? "ev"];
                const expandable = Boolean(a.detail || a.action || a.href);
                const isOpen = open === a.id;
                return (
                  <div key={a.id} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground" title={DEVICES.find((d) => d.id === (a.device ?? "ev"))?.label}>
                        <Icon size={15} />
                      </span>
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => expandable && setOpen(isOpen ? null : a.id)}
                        aria-expanded={expandable ? isOpen : undefined}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill tone={a.status === "resolved" ? "success" : SEV_TONE[a.severity]}>
                            {a.status === "active" ? a.severity : a.status}
                          </StatusPill>
                          <span className="text-sm font-medium text-foreground">{a.title}</span>
                          {expandable && <ChevronDown size={14} className={`text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{a.asset} · {a.site} · {timeAgo(a.created_at)}</div>
                      </button>
                      {a.status !== "resolved" && (
                        <div className="flex items-center gap-1 shrink-0">
                          {a.status === "active" && (
                            <Button
                              onClick={() => act(a.id, "acknowledge")}
                              disabled={pending === a.id}
                              title="Acknowledge"
                              aria-label={`Acknowledge alert: ${a.title}`}
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            >
                              <Check size={13} />
                            </Button>
                          )}
                          <Button
                            onClick={() => act(a.id, "resolve")}
                            disabled={pending === a.id}
                            title="Resolve"
                            aria-label={`Resolve alert: ${a.title}`}
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600"
                          >
                            <CheckCheck size={13} />
                          </Button>
                        </div>
                      )}
                    </div>
                    {isOpen && (
                      <div className="mt-2.5 ml-11 rounded-xl bg-muted/60 px-4 py-3 text-sm space-y-1.5">
                        {a.detail && <p className="text-foreground">{a.detail}</p>}
                        {a.action && (
                          <p className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                            <Wrench size={14} className="mt-0.5 shrink-0" /> {a.action}
                          </p>
                        )}
                        {a.href && (
                          <Link
                            href={a.href}
                            onClick={() => a.device && setDevice(a.device)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                          >
                            View {a.device === "fleet" ? "vehicle" : "device"} <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
