"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle, TrendingUp, BatteryLow, Wrench, Lightbulb, Check, CheckCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";

interface Insight {
  type: "capacity_risk" | "rising_demand" | "underutilised" | "recurring_fault";
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
}

const STATUS_FILTERS: { value: "" | Alert["status"]; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

const SEV_TONE = { high: "critical", medium: "warning", low: "info", info: "neutral" } as const;
const TYPE_META: Record<Insight["type"], { icon: LucideIcon; label: string }> = {
  capacity_risk: { icon: AlertTriangle, label: "Capacity risk" },
  rising_demand: { icon: TrendingUp, label: "Rising demand" },
  underutilised: { icon: BatteryLow, label: "Underutilised" },
  recurring_fault: { icon: Wrench, label: "Recurring fault" },
};
const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
};

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState<"" | Alert["status"]>("");
  const insights = useSWR<Insight[]>("/ani/insights", fetcher, { refreshInterval: 60000 });
  const alerts = useSWR<Alert[]>(
    `/alerts${statusFilter ? `?status=${statusFilter}` : ""}`,
    fetcher,
    { refreshInterval: 60000 },
  );
  const [pending, setPending] = useState<string | null>(null);

  const list = insights.data ?? [];
  const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  list.forEach((i) => (counts[i.severity] = (counts[i.severity] ?? 0) + 1));

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
        subtitle="Prioritised, explainable findings from the ANI™ engine — every one carries a 'why'."
        status={
          insights.data
            ? [
                { label: "High", value: counts.high ?? 0 },
                { label: "Medium", value: counts.medium ?? 0 },
                { label: "Low", value: counts.low ?? 0 },
              ]
            : []
        }
      />

      {insights.error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb size={16} className="text-emerald-600" /> ANI™ Insights
          </div>
          {!insights.data ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : !list.length ? (
            <Panel><EmptyBox message="No insights — network healthy across all sites." /></Panel>
          ) : (
            list.map((ins, i) => {
              const meta = TYPE_META[ins.type];
              const Icon = meta.icon;
              return (
                <Panel key={i}>
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
            })
          )}
        </div>

        <Panel
          title="Alerts"
          subtitle="Operational feed — acknowledge or resolve to track response"
          bodyClassName="p-0"
          right={
            <div className="flex gap-1">
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
          ) : !alerts.data.length ? (
            <EmptyBox message="No alerts match this filter." />
          ) : (
            <div className="divide-y divide-border">
              {alerts.data.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                  <StatusPill tone={a.status === "resolved" ? "success" : SEV_TONE[a.severity]}>
                    {a.status === "active" ? a.severity : a.status}
                  </StatusPill>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.asset} · {a.site} · {timeAgo(a.created_at)}</div>
                  </div>
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
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
