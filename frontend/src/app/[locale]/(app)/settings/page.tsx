"use client";

import { useState } from "react";
import useSWR from "swr";
import { User as UserIcon, Building2, SlidersHorizontal, ShieldCheck, Users, KeyRound, UserPlus, Pencil, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/shared/PageHeader";
import Panel from "@/components/shared/Panel";
import MembershipPanel from "@/components/shared/MembershipPanel";
import { useLinkedAccounts, SupplierCompanyReadOnly } from "@/components/settings/LinkedSettings";
import StatusPill from "@/components/shared/StatusPill";
import type { Preferences, Role, User, Market } from "@/lib/types";
import { MARKETS, MARKET_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Org = { id: string; name: string; slug: string; plan: string; region: string; market?: Market };

const ROLES: Role[] = ["admin", "operator", "pilot"];
const STATIC_TENANT_IDS = new Set(["davwo", "pilot-mcr", "growth-leeds", "acme"]);
const DEMO_SEED_USER_IDS = new Set(["u-admin", "u-operator", "u-pilot", "u-acme-admin"]);

function TeamPanel({ selfId }: { selfId?: string }) {
  const { data: users, mutate } = useSWR<User[]>("/users", fetcher);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Without RESEND_API_KEY configured, invites succeed but no email goes out
  // — the temp password must be shown here so the admin can relay it, or the
  // invited account can never log in. A toast auto-dismisses too fast for a
  // credential; this stays on screen until explicitly dismissed.
  const [pendingCredential, setPendingCredential] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const { data } = await api.post<{ emailed: boolean; tempPassword?: string }>("/users/invite", { name, email, role });
      if (!data.emailed && data.tempPassword) {
        setPendingCredential({ name, email, tempPassword: data.tempPassword });
      } else {
        toast.success(`Invited ${name}`);
      }
      setName(""); setEmail("");
      await mutate();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not send the invite.");
    } finally {
      setInviting(false);
    }
  };

  const copyPassword = async () => {
    if (!pendingCredential) return;
    await navigator.clipboard.writeText(pendingCredential.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const changeRole = async (userId: string, newRole: Role) => {
    setBusyId(userId);
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      toast.success("Role updated");
      await mutate();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update the role.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (userId: string, userName: string) => {
    if (!window.confirm(`Remove ${userName} from the organisation?`)) return;
    setBusyId(userId);
    try {
      await api.delete(`/users/${userId}`);
      toast.success(`Removed ${userName}`);
      await mutate();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not remove that user.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel title="Team" right={<Users size={18} className="text-muted-foreground" />}>
      <div className="divide-y divide-border mb-4">
        {!users ? (
          <div className="py-3 text-sm text-muted-foreground">Loading…</div>
        ) : (
          users.map((u) => {
            const isSelf = u.id === selfId;
            const locked = isSelf || DEMO_SEED_USER_IDS.has(u.id);
            return (
              <div key={u.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{u.name}{isSelf && " (you)"}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {locked ? (
                    <StatusPill tone="info">{u.role}</StatusPill>
                  ) : (
                    <Select value={u.role} disabled={busyId === u.id} onValueChange={(v) => changeRole(u.id, v as Role)}>
                      <SelectTrigger className="h-auto w-auto gap-1.5 py-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(u.id, u.name)}
                      disabled={busyId === u.id}
                      aria-label={`Remove ${u.name}`}
                      className="h-auto w-auto p-1 text-muted-foreground hover:bg-transparent hover:text-red-600"
                    >
                      <X size={15} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {pendingCredential && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <KeyRound size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 dark:text-amber-200 min-w-0">
                <div className="font-medium">
                  Email delivery isn&apos;t configured — share this temporary password with {pendingCredential.name} ({pendingCredential.email}) yourself.
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="px-2 py-1 rounded-lg bg-card border border-amber-200 dark:border-amber-500/30 font-mono text-[13px] text-foreground">
                    {pendingCredential.tempPassword}
                  </code>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={copyPassword}
                    className="h-auto gap-1 p-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </Button>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPendingCredential(null)}
              aria-label="Dismiss"
              className="h-auto w-auto shrink-0 p-0 text-amber-600 hover:bg-transparent hover:text-amber-900"
            >
              <X size={15} />
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-auto py-1.5" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-auto py-1.5" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="mt-1 h-auto py-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={inviting} size="sm" className="h-auto gap-1.5 py-1.5">
          <UserPlus size={14} /> {inviting ? "Inviting…" : "Invite"}
        </Button>
      </form>
    </Panel>
  );
}

function ProfilePanel({ user, onUpdated }: { user?: User; onUpdated: (u: User) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setName(user?.name ?? "");
    setJobTitle(user?.job_title ?? "");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch<User>("/auth/me", { name, job_title: jobTitle });
      onUpdated(data);
      toast.success("Profile updated");
      setEditing(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Profile" right={<UserIcon size={18} className="text-muted-foreground" />}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white font-semibold flex items-center justify-center">
          {user?.avatar_initials || "U"}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{user?.job_title}</div>
        </div>
        {!editing && (
          <Button variant="ghost" size="icon" onClick={startEditing} className="h-auto w-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Edit profile">
            <Pencil size={15} />
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-3 border-t border-border pt-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Job title</label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {field("Email", user?.email)}
          {field("Role", <StatusPill tone="info">{user?.role}</StatusPill>)}
          {field("Member of", user?.orgName)}
        </>
      )}
    </Panel>
  );
}

function OrganisationPanel({ user, org, isStatic, canEdit, onUpdated }: {
  user?: User; org?: Org; isStatic: boolean; canEdit: boolean; onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org?.name ?? "");
  const [region, setRegion] = useState(org?.region ?? "");
  const [market, setMarket] = useState<Market>(org?.market ?? "uk");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setName(org?.name ?? "");
    setRegion(org?.region ?? "");
    setMarket(org?.market ?? "uk");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/org", { name, region, market });
      onUpdated();
      toast.success("Organisation updated");
      setEditing(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update the organisation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Organisation" right={<Building2 size={18} className="text-muted-foreground" />}>
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Region</label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Market</label>
            <Select value={market} onValueChange={(v) => setMarket(v as Market)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MARKETS.map((m) => <SelectItem key={m} value={m}>{MARKET_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Selects which live grid/tariff data your dashboard uses.</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1">{field("Name", org?.name ?? user?.orgName ?? "—")}</div>
            {canEdit && !isStatic && (
              <Button variant="ghost" size="icon" onClick={startEditing} className="h-auto w-auto shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Edit organisation">
                <Pencil size={15} />
              </Button>
            )}
          </div>
          {field("Region", org?.region ?? "—")}
          {field("Market", MARKET_LABEL[org?.market ?? "uk"])}
          {field("Plan", <StatusPill tone="success">{org?.plan ?? "—"}</StatusPill>)}
          {field("Tenant ID", <code className="text-xs">{user?.orgId}</code>)}
          {isStatic && (
            <div className="mt-3 text-xs text-muted-foreground">
              This is a shared demo organisation — its details are fixed and can&rsquo;t be edited.
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function PreferencesPanel() {
  const { data: prefs, mutate } = useSWR<Preferences>("/users/preferences", fetcher);

  const toggle = async (key: keyof Preferences) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    await mutate(api.patch<Preferences>("/users/preferences", { [key]: next[key] }).then((r) => r.data), {
      optimisticData: next,
      revalidate: false,
    });
    toast.success("Preferences saved");
  };

  return (
    <Panel title="Preferences" right={<SlidersHorizontal size={18} className="text-muted-foreground" />}>
      {pref("Live data", "Use real UK grid APIs where available", prefs?.liveData ?? true, () => toggle("liveData"))}
      {pref("Email alerts", "Notify me about high-severity insights", prefs?.emailAlerts ?? true, () => toggle("emailAlerts"))}
      {pref("Auto-optimise", "Let ANI™ schedule load to the smart window", prefs?.autoOptimise ?? false, () => toggle("autoOptimise"))}
    </Panel>
  );
}

function ChangePasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users/change-password", { currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword(""); setNewPassword("");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-3 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <KeyRound size={15} /> Change password
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Current password</label>
        <Input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">New password (min. 8 characters)</label>
        <Input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
      </div>
      <Button type="submit" disabled={saving} variant="secondary">
        {saving ? "Updating…" : "Update Password"}
      </Button>
    </form>
  );
}

/**
 * Settings — the same sections in the same order as the Supplier Portal's
 * Settings, so a Full member sees one combined page on either platform.
 * ANI™ sections are editable here; the supplier Company profile is shown
 * read-only with an "Edit in Supplier Portal" switch (and vice versa there).
 */
export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { data: orgs, mutate: mutateOrgs } = useSWR<Org[]>("/tenants", fetcher);
  const { data: linked } = useLinkedAccounts("ani", api);
  const org = orgs?.find((o) => o.id === user?.orgId);
  const isStatic = user ? STATIC_TENANT_IDS.has(user.orgId) : false;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your membership, profile, company and preferences — the same settings on ANI™ and the Supplier Portal." />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="lg:col-span-2">
          <MembershipPanel current="ani" client={api} />
        </div>

        <ProfilePanel user={user ?? undefined} onUpdated={() => refresh()} />
        <SupplierCompanyReadOnly data={linked} />

        <OrganisationPanel
          user={user ?? undefined}
          org={org}
          isStatic={isStatic}
          canEdit={user?.role === "admin"}
          onUpdated={() => mutateOrgs()}
        />
        <PreferencesPanel />

        <Panel title="Security" className="lg:col-span-2" right={<ShieldCheck size={18} className="text-muted-foreground" />}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Signed in to ANI™ as</span>
                <span className="font-medium text-foreground">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Authentication</span>
                <span className="font-medium text-foreground">JWT (HS256)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Multi-tenancy</span>
                <StatusPill tone="success">Enabled</StatusPill>
              </div>
              <p className="text-xs text-muted-foreground pt-1">ANI™ and the Supplier Portal have separate passwords — this changes your ANI™ password.</p>
            </div>
            <div className="[&>form]:mt-0 [&>form]:border-t-0 [&>form]:pt-0"><ChangePasswordPanel /></div>
          </div>
        </Panel>

        {user?.role === "admin" && (
          <div className="lg:col-span-2">
            <TeamPanel selfId={user?.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function field(label: string, value: React.ReactNode) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function pref(label: string, desc: string, on: boolean, set: () => void) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={on} onCheckedChange={set} />
    </div>
  );
}
