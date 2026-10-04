"use client";

import { UserPlus, Users } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton } from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupplierAccount } from "@/lib/supplierPortal";

/** Supplier accounts are single-login today (one email + password per
 * company — no member model yet), so this shows the owner and keeps the
 * invite form visibly disabled rather than pretending to send invites. */
export default function SupplierTeamPage() {
  const { data: supplier } = useSupplierAccount();
  const initials = supplier?.companyName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() ?? "S";

  return (
    <div>
      <PageHeader title="Team" subtitle="People at your company who can manage listings and reply to enquiries." />

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <Panel title="Members" className="lg:col-span-2">
          {!supplier ? (
            <Skeleton className="h-14" />
          ) : (
            <div className="flex items-center gap-3 border border-border rounded-xl p-3">
              <div className="relative overflow-hidden w-10 h-10 rounded-full text-white text-sm font-semibold flex items-center justify-center shrink-0">
                <span className="absolute inset-0 bg-map-dark" />
                <span className="absolute inset-0 bg-grain" />
                <span className="relative z-10">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">{supplier.companyName}</div>
                <div className="text-xs text-muted-foreground truncate">{supplier.email}</div>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Owner</span>
            </div>
          )}
        </Panel>

        <Panel title="Invite a teammate">
          <div className="space-y-3">
            <Input disabled placeholder="colleague@company.com" />
            <Button disabled className="w-full gap-1.5"><UserPlus size={15} /> Send invite</Button>
            <div className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <Users size={14} className="shrink-0 mt-0.5" />
              <span>Team accounts are coming soon. For now each supplier has one login — share access by contacting Davwo support.</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
