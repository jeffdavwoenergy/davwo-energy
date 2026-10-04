"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import supplierApi from "@/lib/supplierApi";
import { apiError, type SupplierLead } from "@/lib/supplierPortal";
import type { LeadStatus } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-sky-50 text-sky-700",
  responded: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
};

export function EnquiryRow({ lead, onResponded, compact = false }: { lead: SupplierLead; onResponded: () => void; compact?: boolean }) {
  const [response, setResponse] = useState("");
  const [sending, setSending] = useState(false);

  const respond = async () => {
    const text = response.trim();
    if (!text) return;
    setSending(true);
    try {
      await supplierApi.patch(`/supplier/leads/${lead.id}`, { response: text });
      toast.success("Response sent");
      onResponded();
    } catch (err: unknown) {
      toast.error(apiError(err, "Could not send that response."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-foreground truncate">{lead.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${LEAD_STATUS_TONE[lead.status]}`}>{lead.status}</span>
          <span className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail size={11} /> {lead.email}</div>
      <p className={`text-sm text-muted-foreground mt-1.5 ${compact ? "line-clamp-2" : ""}`}>{lead.message}</p>
      {!compact && lead.response && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[11px] font-medium text-muted-foreground">Your response</div>
          <p className="text-sm text-foreground/80 mt-0.5">{lead.response}</p>
        </div>
      )}
      {!compact && lead.status === "new" && (
        <div className="mt-2.5 flex items-center gap-2">
          <Input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Reply to this enquiry…" />
          <Button onClick={respond} disabled={sending || !response.trim()} size="sm" variant="secondary" className="h-auto shrink-0 py-2 text-xs">
            {sending ? "Sending…" : "Respond"}
          </Button>
        </div>
      )}
    </div>
  );
}
