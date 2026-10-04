"use client";

import { useState } from "react";
import { Inbox, MessageSquareReply, Timer, Handshake, Check, X } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, EmptyBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import { LEAD_STATUS_TONE } from "@/components/supplier/EnquiryRow";
import { useSupplierLeads, useSupplierProducts, type SupplierLead } from "@/lib/supplierPortal";
import type { SupplierProduct } from "@/lib/supplierCatalog";
import type { LeadStatus } from "@/lib/server/marketplace";

const WEEKS = 8;
const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

// Module-level so the impure Date.now() isn't inside a render closure (same
// reasoning as TopBar's minutesSince).
function weeklyCounts(leads: SupplierLead[]): { start: Date; count: number }[] {
  const thisWeek = weekStart(new Date(Date.now()));
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (WEEKS - 1 - i) * 7);
    return { start, count: 0 };
  });
  for (const l of leads) {
    const ws = weekStart(new Date(l.createdAt)).getTime();
    const b = buckets.find((x) => x.start.getTime() === ws);
    if (b) b.count++;
  }
  return buckets;
}

function last30(leads: SupplierLead[]): number {
  const since = Date.now() - 30 * DAY;
  return leads.filter((l) => new Date(l.createdAt).getTime() >= since).length;
}

function medianHoursToRespond(leads: SupplierLead[]): number | undefined {
  const hours = leads
    .filter((l) => l.respondedAt)
    .map((l) => (new Date(l.respondedAt!).getTime() - new Date(l.createdAt).getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  if (!hours.length) return undefined;
  const mid = Math.floor(hours.length / 2);
  return hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
}

const fmtWeek = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Single-series weekly bar chart: one brand hue, rounded data-ends on the
 * baseline, recessive gridlines, per-bar hover tooltip, and a screen-reader
 * table carrying the same numbers. */
function WeeklyEnquiriesChart({ data }: { data: { start: Date; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...data.map((d) => d.count));
  const top = Math.ceil(max / 4) * 4;
  const ticks = [top, top * 0.75, top * 0.5, top * 0.25, 0];

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between h-48 text-[11px] text-muted-foreground tabular-nums text-right w-6 -mt-1.5 pb-0">
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative flex-1 h-48" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="absolute left-0 right-0 border-t border-border/70" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-2">
            {data.map((d, i) => (
              <div
                key={i}
                className="relative flex-1 h-full flex items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full max-w-10 rounded-t-[4px] transition-colors ${hover === i ? "bg-emerald-700" : "bg-emerald-600"}`}
                  style={{ height: d.count ? `${(d.count / top) * 100}%` : 0 }}
                />
                {hover === i && (
                  <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-md" style={{ bottom: `${(d.count / top) * 100}%` }}>
                    <div className="text-muted-foreground">Week of {fmtWeek(d.start)}</div>
                    <div className="font-semibold text-foreground">{d.count} enquir{d.count === 1 ? "y" : "ies"}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <div className="w-6" />
        <div className="flex-1 flex gap-[2px] sm:gap-2 text-[11px] text-muted-foreground">
          {data.map((d, i) => (
            <span key={i} className={`flex-1 text-center ${i % 2 ? "hidden sm:block" : ""}`}>{fmtWeek(d.start)}</span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Enquiries per week</caption>
        <thead><tr><th>Week starting</th><th>Enquiries</th></tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{fmtWeek(d.start)}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const STATUS_ORDER: LeadStatus[] = ["new", "responded", "accepted", "declined"];

function listingChecks(p: SupplierProduct) {
  const l = p.listing ?? {};
  return [
    { label: "Plan pricing", ok: l.monthlyPrice !== undefined },
    { label: "Photos", ok: (p.imageIds?.length ?? 0) > 0 },
    { label: "Key specs", ok: (l.keySpecs?.length ?? 0) > 0 },
    { label: "Features", ok: (l.features?.length ?? 0) > 0 },
    { label: "Install time", ok: Boolean(l.installEstimate) },
  ];
}

export default function SupplierAnalyticsPage() {
  const { leads } = useSupplierLeads();
  const { products } = useSupplierProducts();

  const decided = leads?.filter((l) => l.status === "accepted" || l.status === "declined") ?? [];
  const accepted = decided.filter((l) => l.status === "accepted").length;
  const answered = leads?.filter((l) => l.status !== "new").length ?? 0;
  const median = leads ? medianHoursToRespond(leads) : undefined;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="How buyers are responding to your listings, based on the enquiries you've received." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Enquiries (30 days)" value={leads ? last30(leads) : "–"} icon={Inbox} tone="sky" caption={leads ? `${leads.length} all time` : undefined} />
        <KpiCard label="Response rate" value={leads?.length ? Math.round((answered / leads.length) * 100) : "–"} unit={leads?.length ? "%" : undefined} icon={MessageSquareReply} tone="mint" caption="Enquiries you've answered" />
        <KpiCard
          label="Median time to reply"
          value={median === undefined ? "–" : median < 1 ? "<1" : median < 48 ? Math.round(median) : Math.round(median / 24)}
          unit={median === undefined ? undefined : median < 48 ? "hrs" : "days"}
          icon={Timer} tone="lavender" caption="From enquiry to your first reply"
        />
        <KpiCard label="Win rate" value={decided.length ? Math.round((accepted / decided.length) * 100) : "–"} unit={decided.length ? "%" : undefined} icon={Handshake} tone="peach" caption="Accepted of decided enquiries" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6 items-start">
        <Panel title="Enquiries per week" subtitle={`Last ${WEEKS} weeks`} className="lg:col-span-2">
          {!leads ? <Skeleton className="h-52" /> : <WeeklyEnquiriesChart data={weeklyCounts(leads)} />}
        </Panel>

        <Panel title="Enquiry status">
          {!leads ? (
            <Skeleton className="h-40" />
          ) : leads.length === 0 ? (
            <EmptyBox message="No enquiries yet." />
          ) : (
            <ul className="space-y-3">
              {STATUS_ORDER.map((s) => {
                const n = leads.filter((l) => l.status === s).length;
                return (
                  <li key={s} className="flex items-center justify-between gap-3 text-sm">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${LEAD_STATUS_TONE[s]}`}>{s}</span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {n} <span className="text-muted-foreground font-normal">· {Math.round((n / leads.length) * 100)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Listing completeness" subtitle="Complete listings give buyers what they need to build a plan.">
        {!products ? (
          <Skeleton className="h-32" />
        ) : products.length === 0 ? (
          <EmptyBox message="No listings yet." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="font-medium py-2 px-1">Listing</th>
                  {listingChecks(products[0]).map((c) => <th key={c.label} className="font-medium py-2 px-2 text-center whitespace-nowrap">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2.5 px-1 font-medium text-foreground">{p.name}</td>
                    {listingChecks(p).map((c) => (
                      <td key={c.label} className="py-2.5 px-2 text-center">
                        {c.ok
                          ? <Check size={16} className="inline text-emerald-600" aria-label="Done" />
                          : <X size={16} className="inline text-muted-foreground/60" aria-label="Missing" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
