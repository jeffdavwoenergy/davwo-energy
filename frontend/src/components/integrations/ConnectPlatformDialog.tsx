"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ExternalLink, Link2, RefreshCw, Trash2, ChevronDown, Radio, KeyRound } from "lucide-react";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { IntegrationProvider, IntegrationReadiness } from "@/lib/integrationCatalog";
import StatusPill from "@/components/shared/StatusPill";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Connection {
  id: string;
  provider: string;
  label: string;
  status: "active" | "error" | "disabled";
  lastSyncAt: string | null;
  lastError: string | null;
  metadata: { demo?: boolean; accountName?: string; deviceCount?: number };
}
interface Overview {
  providers: IntegrationProvider[];
  connections: Connection[];
  live: null | { syncedAt: string; origin: "provider" | "database" | "stored"; errors: string[]; devices: { type: string; count: number }[] };
}

const READINESS: Record<IntegrationReadiness, { label: string; tone: "success" | "info" | "neutral" }> = {
  live: { label: "Live", tone: "success" },
  next: { label: "Next up", tone: "info" },
  planned: { label: "Assessed", tone: "neutral" },
};

const errDetail = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
}

function Assessment({ p }: { p: IntegrationProvider }) {
  const rows: [string, string][] = [
    ["Authentication", p.auth],
    ["Permissions", p.permissions],
    ["Cost", p.cost],
    ["Test data", p.testData],
    ["Fit with Davwo", p.fit],
  ];
  return (
    <dl className="mt-3 space-y-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="font-semibold text-foreground">{k}</dt>
          <dd className="text-muted-foreground">{v}</dd>
        </div>
      ))}
      <a href={p.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-700">
        Developer docs <ExternalLink size={12} />
      </a>
    </dl>
  );
}

function ProviderCard({ p, isAdmin, demoConnected, onConnected }: {
  p: IntegrationProvider; isAdmin: boolean; demoConnected: boolean; onConnected: () => void;
}) {
  const [open, setOpen] = useState(p.readiness === "live");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"token" | "demo" | null>(null);
  const r = READINESS[p.readiness];

  const connect = async (demo: boolean) => {
    setBusy(demo ? "demo" : "token");
    try {
      const { data } = await api.post<{ devices: number }>("/integrations", demo ? { provider: p.id, demo: true } : { provider: p.id, token });
      toast.success(`Connected ${p.name}: ${data.devices} device${data.devices === 1 ? "" : "s"} found`);
      setToken("");
      onConnected();
    } catch (err) {
      toast.error(errDetail(err, "Couldn't connect"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">{p.name}</span>
          <span className="block text-[11px] text-muted-foreground">{p.assetTypes.join(" · ")}</span>
        </span>
        <StatusPill tone={r.tone} dot={p.readiness === "live"}>{r.label}</StatusPill>
        <ChevronDown size={16} className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div>
          {p.readiness === "live" && (
            <div className="mt-3 space-y-2">
              {!isAdmin ? (
                <p className="text-xs text-muted-foreground">Only an admin can connect device platforms.</p>
              ) : (
                <>
                  {p.credentialFields?.map((f) => (
                    <div key={f.key}>
                      <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                      <div className="mt-1 flex gap-2">
                        <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" />
                        <Button onClick={() => connect(false)} disabled={!token.trim() || busy !== null} className="gap-1.5 shrink-0">
                          <KeyRound size={14} /> {busy === "token" ? "Checking…" : "Connect"}
                        </Button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{f.help} Stored encrypted; never shown again.</p>
                    </div>
                  ))}
                  {p.demoAvailable && (
                    <Button variant="outline" onClick={() => connect(true)} disabled={demoConnected || busy !== null} className="w-full gap-2">
                      <Radio size={14} />
                      {demoConnected ? "Public demo sites connected" : busy === "demo" ? "Connecting…" : "Try with Victron's public demo sites (real, live data)"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          <Assessment p={p} />
        </div>
      )}
    </div>
  );
}

export default function ConnectPlatformDialog({ open, onOpenChange, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canSync = user?.role === "admin" || user?.role === "operator";
  const { data, mutate } = useSWR<Overview>(open ? "/integrations" : null, fetcher);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => { mutate(); onChanged(); };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await mutate((await api.post<Overview>("/integrations/sync")).data, { revalidate: false });
      onChanged();
      toast.success("Synced");
    } catch (err) {
      toast.error(errDetail(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async (c: Connection) => {
    if (!confirm(`Disconnect ${c.label}? Its devices and their readings will be removed from Davwo.`)) return;
    try {
      await api.delete(`/integrations/${c.id}`);
      toast.success("Disconnected");
      refresh();
    } catch (err) {
      toast.error(errDetail(err, "Couldn't disconnect"));
    }
  };

  const order: IntegrationReadiness[] = ["live", "next", "planned"];
  const providers = [...(data?.providers ?? [])].sort((a, b) => order.indexOf(a.readiness) - order.indexOf(b.readiness));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 size={18} /> Connect a device platform</DialogTitle>
        </DialogHeader>
        <div className="max-h-[72vh] overflow-y-auto space-y-4 pr-1">
          <p className="text-sm text-muted-foreground">
            Connected devices appear in your asset register with real telemetry, and every dashboard, alert, forecast and
            Ask ANI™ answer uses their data instead of demo data. Credentials stay in Davwo&apos;s database, encrypted with Davwo&apos;s own key.
          </p>

          {!!data?.connections.length && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connected</div>
                {canSync && (
                  <Button size="sm" variant="ghost" onClick={syncNow} disabled={syncing} className="h-7 gap-1.5 text-xs">
                    <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}
                  </Button>
                )}
              </div>
              {data.connections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground truncate">{c.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.metadata.deviceCount ?? 0} devices · synced {ago(c.lastSyncAt)}
                      {c.lastError ? ` · ${c.lastError}` : ""}
                    </span>
                  </span>
                  <StatusPill tone={c.status === "active" ? "success" : c.status === "error" ? "critical" : "neutral"}>
                    {c.status === "active" ? "Live" : c.status === "error" ? "Error" : "Paused"}
                  </StatusPill>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" onClick={() => disconnect(c)} className="h-8 w-8" aria-label={`Disconnect ${c.label}`}>
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              ))}
              {data.live?.origin === "stored" && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  The provider couldn&apos;t be reached on the last sync; showing the last data stored in Davwo.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Platforms</div>
            {!data
              ? <div className="h-32 rounded-xl bg-muted animate-pulse" />
              : providers.map((p) => (
                  <ProviderCard key={p.id} p={p} isAdmin={isAdmin}
                    demoConnected={data.connections.some((c) => c.provider === p.id && c.metadata.demo)}
                    onConnected={refresh} />
                ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
