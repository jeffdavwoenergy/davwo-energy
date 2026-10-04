"use client";

import useSWR from "swr";
import type { AxiosInstance } from "axios";
import { useLocale } from "next-intl";
import {
  User as UserIcon, Building2, SlidersHorizontal, Users, Store, BadgeCheck, ArrowUpRight, Lock, type LucideIcon,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import Panel, { Skeleton } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { performSwitch, PLATFORM_PATHS, type Platform } from "@/lib/portalSwitch";
import { MARKET_LABEL, type Market, type Preferences, type Role, type User } from "@/lib/types";
import { CATEGORIES as SUPPLIER_CATEGORIES } from "@/components/supplier/ProductListingForm";

/** /api/membership/accounts — both sides of a linked Full member's account. */
export interface LinkedAccounts {
  current: Platform;
  ani: {
    user: User & { preferences?: Preferences };
    org: { id: string; name: string; region: string; market: Market; plan: string };
    team: { id: string; name: string; email: string; role: Role }[];
  } | null;
  supplier: {
    id: string; email: string; companyName: string; category: string;
    region?: string; website?: string; verified: boolean;
  } | null;
}

export function useLinkedAccounts(current: Platform, client: AxiosInstance) {
  return useSWR<LinkedAccounts>(["/membership/accounts", current], ([url]: [string]) => client.get(url).then((r) => r.data));
}

const NAME: Record<Platform, string> = { ani: "ANI™", supplier: "Supplier Portal" };

export function SettingsField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right truncate">{value || "—"}</span>
    </div>
  );
}

/** "Edit in ANI™" / "Edit in Supplier Portal" — switches to the other platform's
 * Settings page (instantly for linked accounts). */
function EditElsewhere({ from, to }: { from: Platform; to: Platform }) {
  const router = useRouter();
  const locale = useLocale();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      onClick={async () => {
        // Only rendered when the other side's data loaded, i.e. the accounts are linked.
        const next = await performSwitch(from, to, { tier: "full", ani: true, supplier: true, linked: true, email: "" }, PLATFORM_PATHS[to].settings);
        if (next.reload) window.location.assign(`/${locale}${next.reload}`);
        else if (next.navigate) router.push(next.navigate);
      }}
    >
      Edit in {NAME[to]} <ArrowUpRight size={13} />
    </Button>
  );
}

/** A section that belongs to the other platform: read-only content with an
 * "Edit in …" button, or — when that side isn't available — why not. */
function OtherPlatformPanel({
  title, icon: Icon, from, to, data, className, children,
}: {
  title: string; icon: LucideIcon; from: Platform; to: Platform; data: LinkedAccounts | undefined;
  className?: string; children: React.ReactNode;
}) {
  const available = data ? Boolean(to === "ani" ? data.ani : data.supplier) : false;
  return (
    <Panel
      title={title}
      className={className}
      right={
        <div className="flex items-center gap-2">
          {available && <EditElsewhere from={from} to={to} />}
          <Icon size={18} className="text-muted-foreground" />
        </div>
      }
    >
      {!data ? (
        <Skeleton className="h-28" />
      ) : available ? (
        children
      ) : (
        <div className="flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3.5">
          <Lock size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="text-foreground font-medium">Part of {NAME[to]}</div>
            <p className="text-muted-foreground mt-0.5">
              Not available on this account. Add {NAME[to]} on the same email — then sign in to it once — to see and manage it here.
            </p>
            <Link href={PLATFORM_PATHS[to].join} className="inline-block mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              Join {NAME[to]} →
            </Link>
          </div>
        </div>
      )}
    </Panel>
  );
}

const PREF_LABELS: { key: keyof Preferences; label: string }[] = [
  { key: "liveData", label: "Live data" },
  { key: "emailAlerts", label: "Email alerts" },
  { key: "autoOptimise", label: "Auto-optimise" },
];

/* ---- ANI™ sections, read-only (shown inside the Supplier Portal) ---- */

export function AniProfileReadOnly({ data }: { data: LinkedAccounts | undefined }) {
  const u = data?.ani?.user;
  return (
    <OtherPlatformPanel title="Profile" icon={UserIcon} from="supplier" to="ani" data={data}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white font-semibold flex items-center justify-center">{u?.avatar_initials || "U"}</div>
        <div>
          <div className="font-semibold text-foreground">{u?.name}</div>
          <div className="text-xs text-muted-foreground">{u?.job_title}</div>
        </div>
      </div>
      <SettingsField label="Email" value={u?.email} />
      <SettingsField label="Role" value={u && <StatusPill tone="info">{u.role}</StatusPill>} />
      <SettingsField label="Member of" value={u?.orgName} />
    </OtherPlatformPanel>
  );
}

export function AniOrganisationReadOnly({ data }: { data: LinkedAccounts | undefined }) {
  const o = data?.ani?.org;
  return (
    <OtherPlatformPanel title="Organisation" icon={Building2} from="supplier" to="ani" data={data}>
      <SettingsField label="Name" value={o?.name} />
      <SettingsField label="Region" value={o?.region} />
      <SettingsField label="Market" value={o && MARKET_LABEL[o.market]} />
      <SettingsField label="Plan" value={o && <StatusPill tone="success">{o.plan}</StatusPill>} />
    </OtherPlatformPanel>
  );
}

export function AniPreferencesReadOnly({ data }: { data: LinkedAccounts | undefined }) {
  const prefs = data?.ani?.user.preferences;
  return (
    <OtherPlatformPanel title="Preferences" icon={SlidersHorizontal} from="supplier" to="ani" data={data}>
      {PREF_LABELS.map(({ key, label }) => (
        <SettingsField key={key} label={label} value={prefs?.[key] ? <StatusPill tone="success">On</StatusPill> : <StatusPill tone="neutral">Off</StatusPill>} />
      ))}
    </OtherPlatformPanel>
  );
}

export function AniTeamReadOnly({ data, className }: { data: LinkedAccounts | undefined; className?: string }) {
  const team = data?.ani?.team ?? [];
  return (
    <OtherPlatformPanel title="Team" icon={Users} from="supplier" to="ani" data={data} className={className}>
      <div className="divide-y divide-border">
        {team.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{m.name}</div>
              <div className="text-xs text-muted-foreground truncate">{m.email}</div>
            </div>
            <StatusPill tone="info">{m.role}</StatusPill>
          </div>
        ))}
      </div>
    </OtherPlatformPanel>
  );
}

/* ---- Supplier section, read-only (shown inside ANI™) ---- */

export function SupplierCompanyReadOnly({ data }: { data: LinkedAccounts | undefined }) {
  const s = data?.supplier;
  return (
    <OtherPlatformPanel title="Company profile" icon={Store} from="ani" to="supplier" data={data}>
      <SettingsField
        label="Company name"
        value={s && (
          <span className="inline-flex items-center gap-1">
            {s.companyName}
            {s.verified && <BadgeCheck size={14} className="text-emerald-600" />}
          </span>
        )}
      />
      <SettingsField label="Main category" value={s && (SUPPLIER_CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category)} />
      <SettingsField label="Region" value={s?.region} />
      <SettingsField label="Website" value={s?.website} />
      <SettingsField label="Status" value={s && (s.verified ? <StatusPill tone="success">Verified supplier</StatusPill> : <StatusPill tone="neutral">Verification pending</StatusPill>)} />
    </OtherPlatformPanel>
  );
}
