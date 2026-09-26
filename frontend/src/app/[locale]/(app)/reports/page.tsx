"use client";

import { useState } from "react";
import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, Download, FileSpreadsheet, Mail } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { formatGBP, formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton } from "@/components/shared/Panel";
import DataSourceBadge from "@/components/shared/DataSourceBadge";
import type { Preferences, ReportSchedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Metrics {
  energy_consumption_mwh: number;
  average_cost_per_kwh: number;
  charging_sessions: number;
  active_chargers: number;
  today_summary: { co2_avoided_tco2: number; total_revenue_gbp: number; cost_savings_gbp: number };
  carbon_intensity_gco2_kwh?: number;
  data_mode: string;
  data_sources?: string[];
}
type Series = { points: { time: string; value: number }[] };
type Insight = { severity: string; asset: string; recommendation: string; why: string };

type ReportCategory = "energy" | "asset" | "carbon" | "ani";
type ReportPeriod = "daily" | "weekly" | "monthly";

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "energy", label: "Energy" },
  { value: "asset", label: "Asset" },
  { value: "carbon", label: "Carbon" },
  { value: "ani", label: "ANI" },
];
const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function ScheduledReportPanel() {
  const { data: prefs, mutate } = useSWR<Preferences>("/users/preferences", fetcher);
  const schedule = prefs?.reportSchedule;
  const [category, setCategory] = useState<ReportCategory>(schedule?.category ?? "energy");
  const [period, setPeriod] = useState<ReportPeriod>(schedule?.period ?? "weekly");

  // The useState initializers above only run once, at first mount — before
  // the SWR fetch of /users/preferences has resolved. Without this sync,
  // local state stays stuck at the "energy"/"weekly" fallback forever, and
  // save() below (which falls back to this local state when the server
  // hasn't returned a value yet) would silently persist those defaults over
  // whatever the user actually had scheduled. Adjusting state directly during
  // render (React's documented pattern for "sync local state to a prop that
  // loaded asynchronously") rather than in an effect, so this settles before
  // the first paint the loaded schedule is visible in, with no extra render.
  const [prevSchedule, setPrevSchedule] = useState(schedule);
  if (schedule !== prevSchedule) {
    setPrevSchedule(schedule);
    if (schedule?.category) setCategory(schedule.category);
    if (schedule?.period) setPeriod(schedule.period);
  }

  const save = async (updates: Partial<ReportSchedule>) => {
    if (!prefs) return;
    const next: ReportSchedule = {
      enabled: schedule?.enabled ?? false,
      category: schedule?.category ?? category,
      period: schedule?.period ?? period,
      ...updates,
    };
    await mutate(
      api.patch<Preferences>("/users/preferences", { reportSchedule: next }).then((r) => r.data),
      { optimisticData: { ...prefs, reportSchedule: next }, revalidate: false },
    );
    toast.success(next.enabled ? "Scheduled report enabled" : "Scheduled report saved");
  };

  return (
    <Panel className="mt-4" title="Scheduled Email Report" subtitle="ANI™ emails this report to you automatically, on this cadence"
      right={<Mail size={18} className="text-muted-foreground" />}>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
          <Select
            value={schedule?.category ?? category}
            onValueChange={(v) => { const c = v as ReportCategory; setCategory(c); if (schedule?.enabled) save({ category: c }); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Cadence</label>
          <Select
            value={schedule?.period ?? period}
            onValueChange={(v) => { const p = v as ReportPeriod; setPeriod(p); if (schedule?.enabled) save({ period: p }); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={schedule?.enabled ?? false} onCheckedChange={() => save({ enabled: !(schedule?.enabled ?? false) })} />
          <span className="text-sm text-muted-foreground">{schedule?.enabled ? "On" : "Off"}</span>
        </div>
      </div>
    </Panel>
  );
}

export default function ReportsPage() {
  const metrics = useSWR<Metrics>("/dashboard/metrics", fetcher);
  const week = useSWR<Series>("/dashboard/energy-series?period=week", fetcher);
  const insights = useSWR<Insight[]>("/ani/insights", fetcher);
  const m = metrics.data;

  const [category, setCategory] = useState<ReportCategory>("energy");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  const download = async (format: "csv" | "pdf") => {
    setDownloading(format);
    try {
      const res = await api.get(`/reports/export?category=${category}&period=${period}&format=${format}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: format === "pdf" ? "application/pdf" : "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `davwo-${category}-${period}-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch {
      toast.error("Could not generate the report — please try again.");
    } finally {
      setDownloading(null);
    }
  };

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const kpis = m
    ? [
        { label: "Energy Delivered (24h)", value: `${m.energy_consumption_mwh} MWh` },
        { label: "Revenue (24h)", value: formatGBP(m.today_summary.total_revenue_gbp) },
        { label: "Avg Cost / kWh", value: formatGBP(m.average_cost_per_kwh, { maximumFractionDigits: 3, minimumFractionDigits: 2 }) },
        { label: "Cost Savings", value: formatGBP(m.today_summary.cost_savings_gbp) },
        { label: "CO₂ Avoided", value: `${formatNumber(m.today_summary.co2_avoided_tco2, 2)} tCO₂` },
        { label: "Grid Carbon", value: m.carbon_intensity_gco2_kwh != null ? `${m.carbon_intensity_gco2_kwh} gCO₂/kWh` : "—" },
        { label: "Charging Sessions (24h)", value: formatNumber(m.charging_sessions) },
        { label: "Active Chargers", value: formatNumber(m.active_chargers) },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Executive summary of network performance, cost and carbon."
        right={m && <DataSourceBadge mode={m.data_mode} sources={m.data_sources} />}
      />

      <Panel title="Generate Report" subtitle="Choose a category and period, then export">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Period</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => download("pdf")} disabled={downloading !== null} className="gap-2">
            <Download size={16} /> {downloading === "pdf" ? "Generating…" : "Export PDF"}
          </Button>
          <Button variant="outline" onClick={() => download("csv")} disabled={downloading !== null} className="gap-2">
            <FileSpreadsheet size={16} /> {downloading === "csv" ? "Generating…" : "Export CSV"}
          </Button>
        </div>
      </Panel>

      <ScheduledReportPanel />

      <Panel className="mt-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-lg text-foreground">Network Performance Summary</div>
              <div className="text-xs text-muted-foreground">Rolling 24-hour period · Generated {today}</div>
            </div>
          </div>
        </div>

        {!m ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                <div className="text-xl font-semibold text-foreground mt-1 font-display">{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Weekly Energy Trend" subtitle="MWh delivered per day">
          {!week.data ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={week.data.points} margin={{ left: -18, top: 8 }}>
                <defs>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#rg)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Key ANI™ Findings" subtitle="Top recommendations this period">
          {!insights.data ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <ol className="space-y-3">
              {insights.data.slice(0, 4).map((ins, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-lg bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{ins.asset}</div>
                    <div className="text-xs text-muted-foreground">{ins.recommendation}</div>
                  </div>
                </li>
              ))}
              {!insights.data.length && <li className="text-sm text-muted-foreground">Network healthy — no findings.</li>}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
