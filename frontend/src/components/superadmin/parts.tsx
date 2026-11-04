"use client";

import { useState, type ReactNode } from "react";
import { Search, KeyRound, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import superAdminApi, { apiError, initialsOf, useOverview, type OverviewUser, type OverviewLead } from "@/lib/superAdminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/shared/StatusPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 rounded-xl bg-card" />
    </div>
  );
}

/** A filter dropdown — "all" is the unfiltered value. */
export function FilterSelect({ value, onChange, allLabel, options, className = "sm:w-48" }: {
  value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-full rounded-xl bg-card ${className}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Initials avatar with the platform's dark map texture. */
export function Avatar({ name, className = "w-9 h-9 text-xs" }: { name?: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-full text-white font-semibold flex items-center justify-center shrink-0 ${className}`}>
      <span className="absolute inset-0 bg-map-dark" />
      <span className="absolute inset-0 bg-grain" />
      <span className="relative z-10">{initialsOf(name)}</span>
    </div>
  );
}

/** Destructive action behind an explicit confirmation. */
export function ConfirmAction({ trigger, title, description, confirmLabel, onConfirm }: {
  trigger: ReactNode; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const ROLE_TONE = { admin: "info", operator: "success", pilot: "warning" } as const;

export function RolePill({ role }: { role: OverviewUser["role"] }) {
  return <StatusPill tone={ROLE_TONE[role]}>{role[0].toUpperCase() + role.slice(1)}</StatusPill>;
}

const LEAD_TONE = { new: "info", responded: "warning", accepted: "success", declined: "neutral" } as const;

export function LeadStatusPill({ status }: { status: OverviewLead["status"] }) {
  return <StatusPill tone={LEAD_TONE[status]}>{status[0].toUpperCase() + status.slice(1)}</StatusPill>;
}

function TempPasswordDialog({ user, password, onClose }: { user: OverviewUser; password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog open={Boolean(password)} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Temporary password issued</DialogTitle>
          <DialogDescription>
            Share this with {user.name} ({user.email}) securely. It replaces their old password immediately and won&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5">
          <code className="flex-1 font-mono text-sm break-all">{password}</code>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Role change, password reset and removal for one user — shared by the
 * Users page and the organisation detail sheet. */
export function UserActions({ user }: { user: OverviewUser }) {
  const { mutate } = useOverview();
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await mutate();
    } catch (err) {
      toast.error(apiError(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      const { data } = await superAdminApi.post<{ tempPassword: string }>(`/superadmin/users/${user.id}/reset-password`);
      setTempPassword(data.tempPassword);
    } catch (err) {
      toast.error(apiError(err, "Could not reset the password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Select
        value={user.role}
        disabled={busy}
        onValueChange={(role) => run(() => superAdminApi.patch(`/superadmin/users/${user.id}`, { role }), `${user.name} is now ${role}.`, "Could not change the role.")}
      >
        <SelectTrigger className="h-8 w-[112px] rounded-lg text-xs" aria-label={`Role for ${user.name}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="operator">Operator</SelectItem>
          <SelectItem value="pilot">Pilot</SelectItem>
        </SelectContent>
      </Select>
      <ConfirmAction
        trigger={
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled={busy} title="Reset password" aria-label={`Reset password for ${user.name}`}>
            <KeyRound size={15} />
          </Button>
        }
        title={`Reset ${user.name}'s password?`}
        description="A new temporary password is generated and their current one stops working straight away."
        confirmLabel="Reset password"
        onConfirm={resetPassword}
      />
      <ConfirmAction
        trigger={
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" disabled={busy} title="Remove user" aria-label={`Remove ${user.name}`}>
            <Trash2 size={15} />
          </Button>
        }
        title={`Remove ${user.name}?`}
        description={<>This deletes <b>{user.email}</b> from {user.orgName}. They will no longer be able to sign in to Ask ANI™.</>}
        confirmLabel="Remove user"
        onConfirm={() => run(() => superAdminApi.delete(`/superadmin/users/${user.id}`), `${user.name} removed.`, "Could not remove the user.")}
      />
      <TempPasswordDialog user={user} password={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  );
}
