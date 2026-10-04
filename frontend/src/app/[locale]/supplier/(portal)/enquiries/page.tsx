"use client";

import { useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, EmptyBox } from "@/components/shared/Panel";
import { EnquiryRow } from "@/components/supplier/EnquiryRow";
import { useSupplierLeads } from "@/lib/supplierPortal";
import type { LeadStatus } from "@/lib/server/marketplace";

const FILTERS: { id: LeadStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "responded", label: "Responded" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
];

export default function SupplierEnquiriesPage() {
  const { leads, mutate } = useSupplierLeads();
  const [filter, setFilter] = useState<LeadStatus | "all">("all");

  const count = (id: LeadStatus | "all") => (id === "all" ? leads?.length : leads?.filter((l) => l.status === id).length) ?? 0;
  const shown = leads?.filter((l) => filter === "all" || l.status === filter);

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Buyers who contacted you from the marketplace. Reply to new enquiries to move them forward." />

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition ${
              filter === f.id ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {f.label} <span className="ml-1 opacity-70 tabular-nums">{count(f.id)}</span>
          </button>
        ))}
      </div>

      <Panel>
        {!shown ? (
          <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : shown.length === 0 ? (
          <EmptyBox message={filter === "all" ? "No enquiries yet. They'll appear here when buyers contact you about a listing." : `No ${filter} enquiries.`} />
        ) : (
          <div className="grid xl:grid-cols-2 gap-3">
            {shown.map((l) => <EnquiryRow key={l.id} lead={l} onResponded={() => mutate()} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
