"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { BadgeCheck, LogOut, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton } from "@/components/shared/Panel";
import MembershipPanel from "@/components/shared/MembershipPanel";
import {
  useLinkedAccounts, AniProfileReadOnly, AniOrganisationReadOnly, AniPreferencesReadOnly, AniTeamReadOnly,
} from "@/components/settings/LinkedSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/components/supplier/ProductListingForm";
import supplierApi, { clearSupplierToken } from "@/lib/supplierApi";
import { useSupplierAccount, apiError, type SupplierAccount } from "@/lib/supplierPortal";

const labelCls = "text-xs font-medium text-muted-foreground";

function ProfileForm({ supplier, onSaved }: { supplier: SupplierAccount; onSaved: (s: SupplierAccount) => void }) {
  const [companyName, setCompanyName] = useState(supplier.companyName);
  const [category, setCategory] = useState(supplier.category);
  const [region, setRegion] = useState(supplier.region ?? "");
  const [website, setWebsite] = useState(supplier.website ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await supplierApi.patch<SupplierAccount>("/supplier/auth/me", { companyName, category, region, website });
      onSaved(data);
      toast.success("Company profile saved");
    } catch (err) {
      toast.error(apiError(err, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Company name</label>
          <Input required maxLength={120} value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className={labelCls}>Main category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className={labelCls}>Region (optional)</label>
          <Input maxLength={80} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. North West England" className="mt-1" />
        </div>
        <div>
          <label className={labelCls}>Website (optional)</label>
          <Input type="url" maxLength={200} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className="mt-1" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Login email</label>
        <Input disabled value={supplier.email} className="mt-1" />
      </div>
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await supplierApi.post("/supplier/auth/password", { currentPassword: current, newPassword: next });
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(apiError(err, "Could not change your password."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className={labelCls}>Current password</label>
        <Input required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1" />
      </div>
      <div>
        <label className={labelCls}>New password (8+ characters)</label>
        <Input required minLength={8} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1" />
      </div>
      <div>
        <label className={labelCls}>Confirm new password</label>
        <Input required minLength={8} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
      </div>
      <Button type="submit" variant="outline" disabled={saving}>{saving ? "Changing…" : "Change password"}</Button>
    </form>
  );
}

/**
 * Settings — the same sections in the same order as ANI™'s Settings, so a
 * Full member sees one combined page on either platform. The Company
 * profile and Security are editable here; ANI™ sections (Profile,
 * Organisation, Preferences, Team) are shown read-only with an "Edit in
 * ANI™" switch, and only when the two accounts are linked.
 */
export default function SupplierSettingsPage() {
  const router = useRouter();
  const { data: supplier, mutate } = useSupplierAccount();
  const { data: linked } = useLinkedAccounts("supplier", supplierApi);

  const signOut = () => {
    clearSupplierToken();
    router.push("/supplier/login");
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your membership, profile, company and preferences — the same settings on ANI™ and the Supplier Portal." />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="lg:col-span-2">
          <MembershipPanel current="supplier" client={supplierApi} />
        </div>

        <AniProfileReadOnly data={linked} />
        <Panel
          title="Company profile"
          subtitle="Shown to buyers alongside your listings."
          right={
            <div className="flex items-center gap-2">
              {supplier?.verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  <BadgeCheck size={13} /> Verified supplier
                </span>
              ) : supplier ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Verification pending</span>
              ) : null}
              <Store size={18} className="text-muted-foreground" />
            </div>
          }
        >
          {!supplier ? <Skeleton className="h-48" /> : <ProfileForm key={supplier.id} supplier={supplier} onSaved={(s) => mutate(s, false)} />}
        </Panel>

        <AniOrganisationReadOnly data={linked} />
        <AniPreferencesReadOnly data={linked} />

        <Panel title="Security" className="lg:col-span-2" right={<ShieldCheck size={18} className="text-muted-foreground" />}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Signed in to Supplier Portal as</span>
                <span className="font-medium text-foreground">{supplier?.email}</span>
              </div>
              <p className="text-xs text-muted-foreground">ANI™ and the Supplier Portal have separate passwords — this changes your Supplier Portal password.</p>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5 text-red-600 hover:text-red-700"><LogOut size={14} /> Sign out</Button>
            </div>
            <PasswordForm />
          </div>
        </Panel>

        <AniTeamReadOnly data={linked} className="lg:col-span-2" />
      </div>
    </div>
  );
}
