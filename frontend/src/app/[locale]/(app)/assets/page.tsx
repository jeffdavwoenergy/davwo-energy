"use client";

import { useState } from "react";
import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Boxes, Plug, Gauge, Zap, Plus, MapPin, Layers, Upload, FileUp, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import KpiCard from "@/components/shared/KpiCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AssetType = "EV Charger" | "Battery" | "Solar";

interface Asset {
  id: string;
  name: string;
  type: string;
  site: string;
  capacity_kw: number;
  ports: number;
  status: "healthy" | "degraded" | "down";
  utilisation_pct: number;
  current_load_kw: number;
  location: { lat: number; lng: number } | null;
  source: "engine" | "preview" | "user";
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installed_at?: string;
  product_id?: string;
}

interface CatalogueProduct {
  id: string;
  name: string;
  vendorId: string;
}
const STATUS_TONE = { healthy: "success", degraded: "warning", down: "critical" } as const;
const ASSET_TYPES: AssetType[] = ["EV Charger", "Battery", "Solar"];

function useProductCatalogue() {
  const { data } = useSWR<{ products: CatalogueProduct[] }>("/marketplace/products", fetcher);
  return data?.products ?? [];
}

function AddAssetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("EV Charger");
  const [site, setSite] = useState("");
  const [capacity, setCapacity] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const products = useProductCatalogue();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/assets", {
        name, type, site, capacity_kw: Number(capacity),
        manufacturer: manufacturer || undefined,
        model: model || undefined,
        serial_number: serialNumber || undefined,
        installed_at: installedAt || undefined,
        product_id: productId || undefined,
      });
      toast.success("Asset registered");
      setName(""); setSite(""); setCapacity(""); setType("EV Charger");
      setManufacturer(""); setModel(""); setSerialNumber(""); setInstalledAt(""); setProductId("");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Could not register the asset — please check the fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a new asset</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Site</label>
            <Input required value={site} onChange={(e) => setSite(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Capacity (kW)</label>
            <Input required type="number" min="1" step="any" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1" />
          </div>

          <div className="pt-2 border-t border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Technical details (optional)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Manufacturer</label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Serial number</label>
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Installed on</label>
              <Input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Purchased from marketplace listing</label>
            <Select value={productId || "none"} onValueChange={(v) => setProductId(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Registering…" : "Register Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ASSETS_CSV_TEMPLATE = "name,type,site,capacity_kw,manufacturer,model,serial_number,installed_at\nDepot Rapid 1,EV Charger,Manchester Depot,150,ABB,Terra 184,SN-10021,2025-03-01\nRooftop Array,Solar,Manchester Depot,80,,,,\nSite Battery,Battery,Manchester Depot,215,,,,";
const READINGS_CSV_TEMPLATE = "asset_name,power_kw,recorded_at\nDepot Rapid 1,35,2026-08-25T09:00:00Z\nDepot Rapid 1,42,2026-08-25T10:00:00Z";

/** Shared by both CSV import flows (assets, readings) — same paste/upload/
 * template/per-row-error UI, just a different endpoint, column hint and
 * sample template. */
function CsvImportDialog({
  open, onOpenChange, onImported, title, endpoint, columnsHint, template,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void;
  title: string; endpoint: string; columnsHint: string; template: string;
}) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(f);
  };

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post<{ imported: number; skipped: number; errors: string[] }>(endpoint, { csv });
      setResult(data);
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} row${data.imported > 1 ? "s" : ""}`);
        onImported();
      } else {
        toast.error("No rows imported — check the errors below.");
      }
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string; errors?: string[] } } })?.response?.data;
      setResult({ imported: 0, skipped: 0, errors: d?.errors ?? [d?.detail ?? "Import failed."] });
      toast.error(d?.detail ?? "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { onOpenChange(v); if (!v) { setCsv(""); setResult(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <p className="text-xs text-muted-foreground">{columnsHint}</p>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 cursor-pointer">
            <FileUp size={15} />
            <span className="underline">Choose a .csv file</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <Textarea
            value={csv} onChange={(e) => setCsv(e.target.value)} rows={7}
            placeholder={template}
            className="text-xs font-mono resize-none"
          />
          <Button variant="link" size="sm" onClick={() => setCsv(template)} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
            Paste a sample template
          </Button>

          {result && (
            <div className="rounded-lg border border-border p-3 text-xs">
              {result.imported > 0 && <div className="text-emerald-700 font-medium">Imported {result.imported}{result.skipped ? `, skipped ${result.skipped}` : ""}.</div>}
              {result.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-amber-700 max-h-28 overflow-y-auto">
                  {result.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !csv.trim()} className="gap-2">
            <Upload size={16} /> {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUSES: Asset["status"][] = ["healthy", "degraded", "down"];

interface ReadingPoint {
  recorded_at: string;
  power_kw?: number;
  energy_kwh?: number;
}

function RecentReadingsChart({ assetId }: { assetId: string }) {
  const { data } = useSWR<{ readings: ReadingPoint[] }>(`/assets/${assetId}/readings?limit=30`, fetcher);
  const points = [...(data?.readings ?? [])]
    .filter((r) => r.power_kw !== undefined)
    .reverse()
    .map((r) => ({ time: new Date(r.recorded_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), value: r.power_kw }));

  if (data && points.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        <TrendingUp size={13} /> Recent readings (power, kW)
      </div>
      {!data ? (
        <Skeleton className="h-24" />
      ) : (
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={points} margin={{ left: -20, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="readingsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#readingsFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function LinkedProduct({ productId }: { productId: string }) {
  const { data } = useSWR<{ product: { name: string }; vendor?: { name: string } }>(`/marketplace/products/${productId}`, fetcher);
  if (!data) return null;
  return (
    <a href={`/products/${productId}`} target="_blank" rel="noopener noreferrer"
      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium underline">
      {data.product.name}{data.vendor ? ` · ${data.vendor.name}` : ""}
    </a>
  );
}

function AssetDetailSheet({ id, onOpenChange, onChanged }: { id: string | null; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const { data, error, mutate } = useSWR<Asset>(id ? `/assets/${id}` : null, fetcher);
  const [busy, setBusy] = useState(false);
  const isUserAsset = data?.source === "user";

  const changeStatus = async (status: Asset["status"]) => {
    if (!data) return;
    setBusy(true);
    try {
      await api.patch(`/assets/${data.id}`, { status });
      await mutate();
      onChanged();
      toast.success("Status updated");
    } catch {
      toast.error("Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!data || !window.confirm(`Remove ${data.name} from the asset register?`)) return;
    setBusy(true);
    try {
      await api.delete(`/assets/${data.id}`);
      toast.success("Asset removed");
      onOpenChange(false);
      onChanged();
    } catch {
      toast.error("Could not remove this asset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{data?.name ?? "Asset detail"}</SheetTitle>
        </SheetHeader>
        {error && <ErrorBox message="Could not load this asset." />}
        {!data && !error ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" />
          </div>
        ) : data ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-center gap-2">
              {isUserAsset ? (
                <Select value={data.status} disabled={busy} onValueChange={(v) => changeStatus(v as Asset["status"])}>
                  <SelectTrigger className="h-auto w-auto gap-1.5 py-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <StatusPill tone={STATUS_TONE[data.status]}>{data.status}</StatusPill>
              )}
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{data.type}</span>
              {data.source === "preview" && <span className="text-[11px] text-muted-foreground">(preview)</span>}
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-muted-foreground">Site</dt><dd className="font-medium text-foreground">{data.site}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Capacity</dt><dd className="font-medium text-foreground">{formatNumber(data.capacity_kw)} kW</dd></div>
              <div><dt className="text-xs text-muted-foreground">Current Load</dt><dd className="font-medium text-foreground">{formatNumber(data.current_load_kw)} kW</dd></div>
              <div><dt className="text-xs text-muted-foreground">Ports</dt><dd className="font-medium text-foreground">{data.ports}</dd></div>
            </dl>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Utilisation</span><span>{data.utilisation_pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.utilisation_pct}%` }} />
              </div>
            </div>
            {data.location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={13} /> {data.location.lat.toFixed(3)}, {data.location.lng.toFixed(3)}
              </div>
            )}

            {isUserAsset && (data.manufacturer || data.model || data.serial_number || data.installed_at || data.product_id) && (
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Technical information</div>
                <dl className="grid grid-cols-2 gap-3">
                  {data.manufacturer && <div><dt className="text-xs text-muted-foreground">Manufacturer</dt><dd className="font-medium text-foreground">{data.manufacturer}</dd></div>}
                  {data.model && <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="font-medium text-foreground">{data.model}</dd></div>}
                  {data.serial_number && <div><dt className="text-xs text-muted-foreground">Serial number</dt><dd className="font-medium text-foreground">{data.serial_number}</dd></div>}
                  {data.installed_at && <div><dt className="text-xs text-muted-foreground">Installed</dt><dd className="font-medium text-foreground">{new Date(data.installed_at).toLocaleDateString("en-GB")}</dd></div>}
                </dl>
                {data.product_id && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-0.5">Purchased from</div>
                    <LinkedProduct productId={data.product_id} />
                  </div>
                )}
              </div>
            )}

            {isUserAsset && <RecentReadingsChart assetId={data.id} />}

            {isUserAsset && (
              <div className="border-t border-border pt-3">
                <Button variant="link" size="sm" onClick={remove} disabled={busy} className="h-auto p-0 text-xs font-semibold text-red-600 hover:text-red-700">
                  Remove this asset
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function AssetsPage() {
  const { data, error, mutate } = useSWR<Asset[]>("/assets", fetcher, { refreshInterval: 30000 });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importReadingsOpen, setImportReadingsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const assets = data ?? [];
  const totalCapacity = assets.reduce((s, a) => s + a.capacity_kw, 0);
  const totalPorts = assets.reduce((s, a) => s + a.ports, 0);
  const totalLoad = assets.reduce((s, a) => s + a.current_load_kw, 0);
  const byType = new Set(assets.map((a) => a.type)).size;

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Every connected asset in one register, with live status and load."
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <Upload size={16} /> Import Assets CSV
            </Button>
            <Button variant="outline" onClick={() => setImportReadingsOpen(true)} className="gap-2">
              <TrendingUp size={16} /> Import Readings CSV
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus size={16} /> Add Asset
            </Button>
          </div>
        }
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label="Total Assets" value={assets.length} icon={Boxes} tone="mint" />
            <KpiCard label="Asset Types" value={byType} icon={Layers} tone="sky" />
            <KpiCard label="Total Ports" value={totalPorts} icon={Plug} tone="lavender" />
            <KpiCard label="Total Capacity" value={formatNumber(totalCapacity)} unit="kW" icon={Gauge} tone="peach" />
            <KpiCard label="Current Load" value={formatNumber(totalLoad)} unit="kW" icon={Zap} tone="amber" />
          </>
        )}
      </div>

      <Panel className="mt-4" title="Asset Register" bodyClassName="p-0">
        {!data ? (
          <div className="p-5"><Skeleton className="h-64" /></div>
        ) : !assets.length ? (
          <EmptyBox />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">
                <TableHead className="px-5 py-3">Asset</TableHead>
                <TableHead className="px-5 py-3">Type</TableHead>
                <TableHead className="px-5 py-3">Status</TableHead>
                <TableHead className="px-5 py-3 w-48">Utilisation</TableHead>
                <TableHead className="px-5 py-3 text-right">Ports</TableHead>
                <TableHead className="px-5 py-3 text-right">Capacity</TableHead>
                <TableHead className="px-5 py-3 text-right">Load</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow
                  key={a.id}
                  onClick={() => setDetailId(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailId(a.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`View details for ${a.name}`}
                  className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset"
                >
                  <TableCell className="px-5 py-3 font-medium text-foreground">
                    {a.name}
                    {a.source === "preview" && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(preview)</span>}
                    {a.source === "user" && <span className="ml-1.5 text-[10px] text-emerald-600 font-normal">(added)</span>}
                  </TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">{a.type}</TableCell>
                  <TableCell className="px-5 py-3"><StatusPill tone={STATUS_TONE[a.status]}>{a.status}</StatusPill></TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.utilisation_pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-9 text-right">{a.utilisation_pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right text-foreground/80">{a.ports}</TableCell>
                  <TableCell className="px-5 py-3 text-right text-foreground/80">{formatNumber(a.capacity_kw)} kW</TableCell>
                  <TableCell className="px-5 py-3 text-right text-foreground/80">{formatNumber(a.current_load_kw)} kW</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()} />
      <CsvImportDialog
        open={importOpen} onOpenChange={setImportOpen} onImported={() => mutate()}
        title="Import assets from CSV" endpoint="/assets/import" template={ASSETS_CSV_TEMPLATE}
        columnsHint="Columns: name, type, site, capacity_kw (required); manufacturer, model, serial_number, installed_at (optional). Type must be EV Charger, Battery or Solar."
      />
      <CsvImportDialog
        open={importReadingsOpen} onOpenChange={setImportReadingsOpen} onImported={() => mutate()}
        title="Import usage readings from CSV" endpoint="/assets/readings/import" template={READINGS_CSV_TEMPLATE}
        columnsHint="Columns: asset_name, power_kw and/or energy_kwh, recorded_at. asset_name must exactly match an existing asset."
      />
      <AssetDetailSheet id={detailId} onOpenChange={(v) => !v && setDetailId(null)} onChanged={() => mutate()} />
    </div>
  );
}
