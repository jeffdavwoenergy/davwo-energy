"use client";

import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { Building2, Users, Store, Package, Inbox, UserPlus, BadgeCheck, ArrowRight } from "lucide-react";
import { useOverview, useSuperAdminSession, formatDate, CATEGORY_LABEL } from "@/lib/superAdminApi";
import PageHeader from "@/components/shared/PageHeader";
import KpiCard from "@/components/shared/KpiCard";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Avatar, LeadStatusPill } from "@/components/superadmin/parts";

function ViewAll({ to }: { to: string }) {
  return (
    <Link href={to} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 shrink-0">
      View all <ArrowRight size={12} />
    </Link>
  );
}

export default function SuperAdminOverviewPage() {
  const { data, error, isLoading } = useOverview();
  const { data: session } = useSuperAdminSession();

  // Newest accounts across both platforms, ANI™ users and suppliers together.
  const signups = useMemo(() => {
    if (!data) return [];
    return [
      ...data.users.filter((u) => u.createdAt).map((u) => ({ id: u.id, name: u.name, sub: `${u.email} · ${u.orgName}`, at: u.createdAt!, kind: "ANI™ user" as const })),
      ...data.suppliers.map((s) => ({ id: s.id, name: s.companyName, sub: s.email, at: s.createdAt, kind: "Supplier" as const })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [data]);

  if (error) return <ErrorBox message="Could not load platform data." />;

  const s = data?.stats;
  return (
    <div>
      <PageHeader
        title="Platform overview"
        subtitle="Everything happening across Ask ANI™ and the Davwo Marketplace — every organisation, user and supplier."
        status={[
          { label: "Signed in as", value: session?.email ?? "…" },
          { label: "Status", value: "Live", dot: true },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading || !s ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)
        ) : (
          <>
            <KpiCard label="Organisations" value={s.organisations} icon={Building2} tone="sky" caption={`${s.customerOrgs} signed-up customers`} />
            <KpiCard label="ANI™ users" value={s.users} icon={Users} tone="mint" caption={`${s.admins} org admins`} />
            <KpiCard label="Suppliers" value={s.suppliers} icon={Store} tone="lavender" caption={`${s.verifiedSuppliers} verified`} />
            <KpiCard label="Listings" value={s.listings} icon={Package} tone="peach" caption="Published on the marketplace" />
            <KpiCard label="Enquiries" value={s.enquiries} icon={Inbox} tone="amber" caption={`${s.openEnquiries} still open`} />
            <KpiCard label="New this week" value={s.newThisWeek} icon={UserPlus} tone="mint" caption="Users + suppliers" />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <Panel title="Organisations" subtitle="Largest first — demo tenants after customers" right={<ViewAll to="/superadmin/organisations" />}>
          {!data ? <Skeleton className="h-48" /> : (
            <ul className="divide-y divide-border">
              {data.organisations.slice(0, 6).map((o) => (
                <li key={o.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={o.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{o.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{o.region || "—"} · {o.market.toUpperCase()}</div>
                  </div>
                  <StatusPill tone={o.demo ? "neutral" : "success"}>{o.demo ? "Demo" : "Customer"}</StatusPill>
                  <div className="text-xs text-muted-foreground w-16 text-right tabular-nums">{o.userCount} user{o.userCount === 1 ? "" : "s"}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent sign-ups" subtitle="New accounts on both platforms" right={<ViewAll to="/superadmin/users" />}>
          {!data ? <Skeleton className="h-48" /> : signups.length === 0 ? <EmptyBox message="No sign-ups yet." /> : (
            <ul className="divide-y divide-border">
              {signups.map((u) => (
                <li key={`${u.kind}-${u.id}`} className="py-2.5 flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.sub}</div>
                  </div>
                  <StatusPill tone={u.kind === "Supplier" ? "info" : "success"} dot={false}>{u.kind}</StatusPill>
                  <div className="hidden sm:block text-xs text-muted-foreground w-24 text-right">{formatDate(u.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest listings" subtitle="What suppliers have published" right={<ViewAll to="/superadmin/marketplace" />}>
          {!data ? <Skeleton className="h-48" /> : data.products.length === 0 ? <EmptyBox message="No listings published yet." /> : (
            <ul className="divide-y divide-border">
              {data.products.slice(0, 6).map((p) => (
                <li key={p.id} className="py-2.5 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-muted overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.vendorName} · {CATEGORY_LABEL[p.category] ?? p.category}</div>
                  </div>
                  <div className="hidden sm:block text-xs text-muted-foreground w-24 text-right">{formatDate(p.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest enquiries" subtitle="Buyers contacting suppliers" right={<ViewAll to="/superadmin/enquiries" />}>
          {!data ? <Skeleton className="h-48" /> : data.leads.length === 0 ? <EmptyBox message="No enquiries yet." /> : (
            <ul className="divide-y divide-border">
              {data.leads.slice(0, 6).map((l) => (
                <li key={l.id} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{l.orgName} <span className="text-muted-foreground font-normal">→</span> {l.vendorName}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.message}</div>
                  </div>
                  <LeadStatusPill status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {data && data.suppliers.some((x) => !x.verified) && (
        <Link
          href="/superadmin/suppliers"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 hover:bg-amber-500/15"
        >
          <BadgeCheck size={18} className="shrink-0" />
          <span className="flex-1">
            {data.suppliers.filter((x) => !x.verified).length} supplier{data.suppliers.filter((x) => !x.verified).length === 1 ? " is" : "s are"} waiting for verification.
          </span>
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
