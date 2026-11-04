"use client";

import { useMemo, useState } from "react";
import { Users, Inbox, MapPin, ChevronRight } from "lucide-react";
import { useOverview, formatDate, type OverviewOrg } from "@/lib/superAdminApi";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, FilterSelect, LeadStatusPill, SearchBox, UserActions } from "@/components/superadmin/parts";

function OrgSheet({ org, onClose }: { org: OverviewOrg | null; onClose: () => void }) {
  const { data } = useOverview();
  const users = data?.users.filter((u) => u.orgId === org?.id) ?? [];
  const leads = data?.leads.filter((l) => l.orgId === org?.id) ?? [];

  return (
    <Sheet open={Boolean(org)} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-background">
        {org && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <Avatar name={org.name} className="w-11 h-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="font-display text-xl truncate">{org.name}</SheetTitle>
                  <SheetDescription className="font-mono text-xs truncate">{org.id}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: "Users", value: users.length },
                { label: "Admins", value: users.filter((u) => u.role === "admin").length },
                { label: "Enquiries", value: leads.length },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-display font-bold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <StatusPill tone={org.demo ? "neutral" : "success"}>{org.demo ? `Demo · ${org.plan}` : "Customer"}</StatusPill>
              <span className="flex items-center gap-1"><MapPin size={12} />{org.region || "No region"} · {org.market.toUpperCase()} market</span>
              {org.createdAt && <span>· Joined {formatDate(org.createdAt)}</span>}
            </div>

            <h3 className="mt-6 mb-2 text-sm font-semibold flex items-center gap-2"><Users size={15} /> Users in this organisation</h3>
            {users.length === 0 ? <EmptyBox message="No users in this organisation." /> : (
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {users.map((u) => (
                  <li key={u.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Avatar name={u.name} className="w-8 h-8 text-[11px]" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>
                    <UserActions user={u} />
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-6 mb-2 text-sm font-semibold flex items-center gap-2"><Inbox size={15} /> Marketplace enquiries sent</h3>
            {leads.length === 0 ? <EmptyBox message="This organisation hasn't contacted any suppliers." /> : (
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {leads.map((l) => (
                  <li key={l.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">To {l.vendorName}</div>
                      <LeadStatusPill status={l.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{l.message}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{l.name} · {formatDate(l.createdAt)}</div>
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

export default function SuperAdminOrganisationsPage() {
  const { data, error } = useOverview();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const orgs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.organisations ?? []).filter((o) =>
      (kind === "all" || (kind === "demo") === o.demo) &&
      (!needle || [o.name, o.id, o.region].some((f) => f?.toLowerCase().includes(needle))),
    );
  }, [data, q, kind]);
  const open = data?.organisations.find((o) => o.id === openId) ?? null;

  if (error) return <ErrorBox message="Could not load organisations." />;

  return (
    <div>
      <PageHeader
        title="Organisations"
        subtitle="Every company and individual using Ask ANI™. Open one to see and manage all of its users."
        status={data ? [
          { label: "Total", value: data.stats.organisations },
          { label: "Customers", value: data.stats.customerOrgs },
        ] : []}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search organisations" />
        <FilterSelect
          value={kind}
          onChange={setKind}
          allLabel="All organisations"
          options={[{ value: "customer", label: "Customers" }, { value: "demo", label: "Demo tenants" }]}
        />
      </div>

      {!data ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : orgs.length === 0 ? <Panel><EmptyBox message="No organisations match." /></Panel> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => setOpenId(o.id)}
              className="text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition group"
            >
              <div className="flex items-start gap-3">
                <Avatar name={o.name} className="w-10 h-10 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-base truncate">{o.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{o.region || "No region"} · {o.market.toUpperCase()}</div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground group-hover:text-foreground mt-1" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <StatusPill tone={o.demo ? "neutral" : "success"}>{o.demo ? `Demo · ${o.plan}` : "Customer"}</StatusPill>
                {o.adminCount === 0 && o.userCount > 0 && <StatusPill tone="critical">No admin</StatusPill>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Users", value: o.userCount },
                  { label: "Admins", value: o.adminCount },
                  { label: "Enquiries", value: o.enquiryCount },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-muted/60 py-2">
                    <div className="text-lg font-display font-bold tabular-nums">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <OrgSheet org={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
