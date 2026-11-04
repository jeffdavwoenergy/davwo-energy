"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useOverview, formatDate } from "@/lib/superAdminApi";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterSelect, LeadStatusPill, SearchBox } from "@/components/superadmin/parts";

export default function SuperAdminEnquiriesPage() {
  const { data, error } = useOverview();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const leads = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.leads ?? []).filter((l) =>
      (status === "all" || l.status === status) &&
      (!needle || [l.name, l.email, l.orgName, l.vendorName, l.message].some((f) => f?.toLowerCase().includes(needle))),
    );
  }, [data, q, status]);

  if (error) return <ErrorBox message="Could not load enquiries." />;

  return (
    <div>
      <PageHeader
        title="Enquiries"
        subtitle="Every enquiry buyers have sent to suppliers through the marketplace, and where each one stands."
        status={data ? [{ label: "Total", value: data.stats.enquiries }, { label: "Open", value: data.stats.openEnquiries }] : []}
      />

      <Panel bodyClassName="p-0">
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-border">
          <SearchBox value={q} onChange={setQ} placeholder="Search buyer, supplier or message" />
          <FilterSelect
            value={status}
            onChange={setStatus}
            allLabel="All statuses"
            options={[
              { value: "new", label: "New" },
              { value: "responded", label: "Responded" },
              { value: "accepted", label: "Accepted" },
              { value: "declined", label: "Declined" },
            ]}
          />
        </div>

        {!data ? <div className="p-4"><Skeleton className="h-64" /></div> : leads.length === 0 ? <EmptyBox message="No enquiries match." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Buyer → Supplier</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell pr-4">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id} className="align-top">
                  <TableCell className="pl-4">
                    <div className="min-w-[200px]">
                      <div className="font-medium flex items-center gap-1.5">
                        <span className="truncate">{l.orgName}</span>
                        <ArrowRight size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate">{l.vendorName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{l.name} · {l.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm max-w-md line-clamp-2">{l.message}</div>
                    {l.response && (
                      <div className="text-xs text-muted-foreground mt-1 max-w-md line-clamp-2">
                        <span className="font-semibold text-foreground/70">Reply:</span> {l.response}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><LeadStatusPill status={l.status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground pr-4 whitespace-nowrap">{formatDate(l.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
