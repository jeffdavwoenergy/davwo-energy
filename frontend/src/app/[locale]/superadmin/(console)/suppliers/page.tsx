"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Globe, Link2, Package, Inbox, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import superAdminApi, { useOverview, apiError, formatDate, CATEGORY_LABEL, type OverviewSupplier } from "@/lib/superAdminApi";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, ConfirmAction, FilterSelect, LeadStatusPill, SearchBox } from "@/components/superadmin/parts";

function useSupplierActions() {
  const { mutate } = useOverview();
  const setVerified = async (s: OverviewSupplier, verified: boolean) => {
    try {
      await superAdminApi.patch(`/superadmin/suppliers/${s.id}`, { verified });
      toast.success(verified ? `${s.companyName} is now verified.` : `Verification removed from ${s.companyName}.`);
      await mutate();
    } catch (err) {
      toast.error(apiError(err, "Could not update verification."));
    }
  };
  const remove = async (s: OverviewSupplier) => {
    try {
      const { data } = await superAdminApi.delete<{ removedListings: number }>(`/superadmin/suppliers/${s.id}`);
      toast.success(`${s.companyName} removed, with ${data.removedListings} listing${data.removedListings === 1 ? "" : "s"}.`);
      await mutate();
    } catch (err) {
      toast.error(apiError(err, "Could not remove the supplier."));
    }
  };
  return { setVerified, remove };
}

function RemoveSupplier({ supplier }: { supplier: OverviewSupplier }) {
  const { remove } = useSupplierActions();
  return (
    <ConfirmAction
      trigger={
        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" title="Remove supplier" aria-label={`Remove ${supplier.companyName}`}>
          <Trash2 size={15} />
        </Button>
      }
      title={`Remove ${supplier.companyName}?`}
      description={<>This deletes the supplier account <b>{supplier.email}</b> and all <b>{supplier.productCount}</b> of its marketplace listings. Their enquiry history is kept.</>}
      confirmLabel="Remove supplier"
      onConfirm={() => remove(supplier)}
    />
  );
}

function SupplierSheet({ supplier, onClose }: { supplier: OverviewSupplier | null; onClose: () => void }) {
  const { data } = useOverview();
  const { setVerified } = useSupplierActions();
  const products = data?.products.filter((p) => p.vendorId === supplier?.id) ?? [];
  const leads = data?.leads.filter((l) => l.vendorId === supplier?.id) ?? [];

  return (
    <Sheet open={Boolean(supplier)} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-background">
        {supplier && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <Avatar name={supplier.companyName} className="w-11 h-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="font-display text-xl truncate flex items-center gap-1.5">
                    {supplier.companyName}
                    {supplier.verified && <BadgeCheck size={18} className="text-emerald-600 shrink-0" />}
                  </SheetTitle>
                  <SheetDescription className="truncate">{supplier.email}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-5 rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Category</span><span>{CATEGORY_LABEL[supplier.category] ?? supplier.category}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Region</span><span>{supplier.region || "—"}</span></div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Website</span>
                {supplier.website ? <a href={supplier.website} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline truncate">{supplier.website}</a> : <span>—</span>}
              </div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Linked ANI™ account</span><span className="truncate">{supplier.linkedUserEmail ?? "None"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Registered</span><span>{formatDate(supplier.createdAt)}</span></div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                <span className="font-medium">Verified supplier</span>
                <Switch checked={supplier.verified} onCheckedChange={(v) => setVerified(supplier, v)} aria-label="Verified supplier" />
              </div>
            </div>

            <h3 className="mt-6 mb-2 text-sm font-semibold flex items-center gap-2"><Package size={15} /> Published listings ({products.length})</h3>
            {products.length === 0 ? <EmptyBox message="No listings published." /> : (
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {products.map((p) => (
                  <li key={p.id} className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.summary}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-6 mb-2 text-sm font-semibold flex items-center gap-2"><Inbox size={15} /> Enquiries received ({leads.length})</h3>
            {leads.length === 0 ? <EmptyBox message="No enquiries yet." /> : (
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {leads.map((l) => (
                  <li key={l.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">From {l.orgName}</div>
                      <LeadStatusPill status={l.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{l.message}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{l.name} · {l.email} · {formatDate(l.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function SuperAdminSuppliersPage() {
  const { data, error } = useOverview();
  const { setVerified } = useSupplierActions();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const suppliers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.suppliers ?? []).filter((s) =>
      (status === "all" || (status === "verified") === s.verified) &&
      (!needle || [s.companyName, s.email, s.region].some((f) => f?.toLowerCase().includes(needle))),
    );
  }, [data, q, status]);
  const open = data?.suppliers.find((s) => s.id === openId) ?? null;

  if (error) return <ErrorBox message="Could not load suppliers." />;

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Every company selling on the Davwo Marketplace. Verify them, review what they've published, or remove them."
        status={data ? [
          { label: "Total", value: data.stats.suppliers },
          { label: "Verified", value: data.stats.verifiedSuppliers },
        ] : []}
      />

      <Panel bodyClassName="p-0">
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-border">
          <SearchBox value={q} onChange={setQ} placeholder="Search company, email or region" />
          <FilterSelect
            value={status}
            onChange={setStatus}
            allLabel="All suppliers"
            options={[{ value: "verified", label: "Verified" }, { value: "unverified", label: "Awaiting verification" }]}
          />
        </div>

        {!data ? <div className="p-4"><Skeleton className="h-64" /></div> : suppliers.length === 0 ? <EmptyBox message="No suppliers match." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Supplier</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="text-center">Listings</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Enquiries</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar name={s.companyName} />
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-1.5">
                          <span className="truncate">{s.companyName}</span>
                          {s.verified && <BadgeCheck size={14} className="text-emerald-600 shrink-0" />}
                          {s.linkedUserId && <span title={`Linked ANI™ account: ${s.linkedUserEmail ?? s.linkedUserId}`} className="text-sky-600"><Link2 size={14} /></span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {s.email}
                          {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="hover:text-foreground" aria-label="Website"><Globe size={12} /></a>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="text-sm">{CATEGORY_LABEL[s.category] ?? s.category}</div>
                    <div className="text-xs text-muted-foreground">Joined {formatDate(s.createdAt)}</div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{s.productCount}</TableCell>
                  <TableCell className="text-center tabular-nums hidden sm:table-cell">{s.enquiryCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={s.verified} onCheckedChange={(v) => setVerified(s, v)} aria-label={`Verify ${s.companyName}`} />
                      {!s.verified && <StatusPill tone="warning" dot={false}>Pending</StatusPill>}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <RemoveSupplier supplier={s} />
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg" onClick={() => setOpenId(s.id)}>
                        Details <ChevronRight size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <SupplierSheet supplier={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
