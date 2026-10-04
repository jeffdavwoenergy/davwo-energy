"use client";

import { Link } from "@/i18n/navigation";
import { Package, Inbox, MessageSquareReply, AlertTriangle, Plus, ArrowRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, EmptyBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import { Button } from "@/components/ui/button";
import { ListingRowCompact } from "@/components/supplier/ListingRow";
import { EnquiryRow } from "@/components/supplier/EnquiryRow";
import { useSupplierAccount, useSupplierProducts, useSupplierLeads } from "@/lib/supplierPortal";

export default function SupplierDashboardPage() {
  const { data: supplier } = useSupplierAccount();
  const { products } = useSupplierProducts();
  const { leads, mutate: mutateLeads } = useSupplierLeads();

  const newLeads = leads?.filter((l) => l.status === "new").length;
  const answered = leads?.filter((l) => l.status !== "new").length ?? 0;
  const responseRate = leads?.length ? Math.round((answered / leads.length) * 100) : undefined;
  const needPricing = products?.filter((p) => p.listing?.monthlyPrice === undefined).length ?? 0;

  return (
    <div>
      <PageHeader
        title={supplier ? `Welcome back, ${supplier.companyName}` : "Dashboard"}
        subtitle="Your listings and the enquiries buyers have sent you."
        right={
          <Button asChild className="gap-1.5">
            <Link href="/supplier/listings?new=1"><Plus size={15} /> Add a product</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Live listings" value={products?.length ?? "–"} icon={Package} tone="mint" caption="On the Davwo Marketplace" />
        <KpiCard label="New enquiries" value={newLeads ?? "–"} icon={Inbox} tone="sky" caption="Waiting for your reply" />
        <KpiCard label="Total enquiries" value={leads?.length ?? "–"} icon={MessageSquareReply} tone="lavender" caption="All time" />
        <KpiCard label="Response rate" value={responseRate === undefined ? "–" : responseRate} unit={responseRate === undefined ? undefined : "%"} icon={MessageSquareReply} tone="peach" caption="Enquiries you've answered" />
      </div>

      {needPricing > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            {needPricing} listing{needPricing > 1 ? "s show" : " shows"} estimated pricing. Set your plan prices so buyers see your real terms.
          </div>
          <Link href="/supplier/listings" className="font-semibold whitespace-nowrap hover:underline">Fix now</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel
          title="Your listings"
          subtitle={products ? `${products.length} on the marketplace` : undefined}
          right={<Link href="/supplier/listings" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">Manage <ArrowRight size={13} /></Link>}
        >
          {!products ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : products.length === 0 ? (
            <EmptyBox message="No listings yet — add your first product to appear on the marketplace." />
          ) : (
            <div className="space-y-3">
              {products.slice(0, 4).map((p) => <ListingRowCompact key={p.id} product={p} />)}
              {products.length > 4 && (
                <Link href="/supplier/listings" className="block text-center text-xs font-semibold text-muted-foreground hover:text-foreground pt-1">
                  View all {products.length} listings
                </Link>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent enquiries"
          subtitle={newLeads ? `${newLeads} waiting for a reply` : undefined}
          right={<Link href="/supplier/enquiries" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">View all <ArrowRight size={13} /></Link>}
        >
          {!leads ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : leads.length === 0 ? (
            <EmptyBox message="No enquiries yet. They'll appear here when buyers contact you about a listing." />
          ) : (
            <div className="space-y-2">
              {leads.slice(0, 5).map((l) => <EnquiryRow key={l.id} lead={l} compact onResponded={() => mutateLeads()} />)}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
