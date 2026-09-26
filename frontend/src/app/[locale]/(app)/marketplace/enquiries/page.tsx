"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import useSWR from "swr";
import { ArrowLeft, Mail, Check, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import type { Lead } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";

const STATUS_TONE = {
  new: "neutral", responded: "warning", accepted: "success", declined: "critical",
} as const;

function EnquiryRow({ lead, onDecided }: { lead: Lead; onDecided: () => void }) {
  const [deciding, setDeciding] = useState(false);

  const decide = async (decision: "accepted" | "declined") => {
    setDeciding(true);
    try {
      await api.patch(`/marketplace/leads/${lead.id}`, { decision });
      toast.success(decision === "accepted" ? "Enquiry accepted" : "Enquiry declined");
      onDecided();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update this enquiry.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/marketplace/${lead.vendorId}`} className="text-sm font-semibold text-foreground hover:text-emerald-600">
            {lead.vendorName ?? "…"}
          </Link>
          <div className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</div>
        </div>
        <StatusPill tone={STATUS_TONE[lead.status]}>{lead.status}</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{lead.message}</p>

      {lead.response && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"><Mail size={11} /> Supplier response</div>
          <p className="text-sm text-foreground/80 mt-1">{lead.response}</p>
        </div>
      )}

      {lead.status === "responded" && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => decide("accepted")} disabled={deciding} className="h-auto gap-1.5 py-1.5 text-xs">
            <Check size={13} /> Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("declined")} disabled={deciding} className="h-auto gap-1.5 py-1.5 text-xs">
            <X size={13} /> Decline
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MyEnquiriesPage() {
  const { data, error, mutate } = useSWR<{ leads: Lead[] }>("/marketplace/leads", fetcher);
  const leads = data?.leads ?? [];

  return (
    <div>
      <PageHeader
        title="My Enquiries"
        subtitle="Enquiries you've sent to marketplace suppliers, and their responses."
        right={
          <Button asChild variant="outline" className="gap-2">
            <Link href="/marketplace"><ArrowLeft size={15} /> Back to Marketplace</Link>
          </Button>
        }
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <Panel>
        {!data ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : leads.length === 0 ? (
          <EmptyBox message="No enquiries sent yet — browse the Marketplace to contact a supplier." />
        ) : (
          <div className="space-y-3">
            {leads.map((l) => <EnquiryRow key={l.id} lead={l} onDecided={() => mutate()} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
