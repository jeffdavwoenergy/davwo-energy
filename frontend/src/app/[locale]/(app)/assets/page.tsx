"use client";

import { useState } from "react";
import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Boxes, Plug, Gauge, Zap, Plus, MapPin, Upload, FileUp, TrendingUp, Sun, BatteryCharging, Truck,
  ShieldCheck, Layers, PenLine, Link2, Keyboard, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useDeviceType, type DeviceType } from "@/lib/deviceType";
import {
  ASSET_TYPE_META, DEVICE_ASSET_TYPE, VEHICLE_KINDS, type AssetType, type AssetSpecs, type SpecField,
} from "@/lib/assetSpecs";
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
  specs?: AssetSpecs;
}

interface CatalogueProduct {
  id: string;
  name: string;
  vendorId: string;
}
const STATUS_TONE = { healthy: "success", degraded: "warning", down: "critical" } as const;

/** Device tabs, in switcher order; each maps to one asset type. */
const TYPE_TABS: { device: DeviceType; type: AssetType; label: string; plural: string; icon: LucideIcon }[] = [
  { device: "ev", type: "EV Charger", label: "EV Chargers", plural: "chargers", icon: Zap },
  { device: "solar", type: "Solar", label: "Solar", plural: "solar arrays", icon: Sun },
  { device: "battery", type: "Battery", label: "Batteries", plural: "batteries", icon: BatteryCharging },
  { device: "fleet", type: "Vehicle", label: "Vehicles", plural: "vehicles", icon: Truck },
];
const TAB_FOR_TYPE = Object.fromEntries(TYPE_TABS.map((t) => [t.type, t])) as Record<AssetType, (typeof TYPE_TABS)[number]>;

function useProductCatalogue() {
  const { data } = useSWR<{ products: CatalogueProduct[] }>("/marketplace/products", fetcher);
  return data?.products ?? [];
}

const specLabel = (f: SpecField, v: string | number | undefined) => {
  if (v === undefined || v === "") return "—";
  if (f.kind === "select") return f.options?.find((o) => o.id === v)?.label ?? String(v);
  return f.unit ? `${typeof v === "number" ? formatNumber(v) : v} ${f.unit}`.replace(" °", "°") : String(v);
};

function SpecInput({ field, value, onChange }: { field: SpecField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "select") {
    return (
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>
          {!field.required && <SelectItem value="none">Not set</SelectItem>}
          {field.options?.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      className="mt-1"
      type={field.kind === "number" ? "number" : "text"}
      step="any"
      min={field.min}
      max={field.max}
      required={field.required}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SpecFields({ type, values, onChange }: { type: AssetType; values: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ASSET_TYPE_META[type].fields.map((f) => (
        <div key={f.key} className={f.kind === "text" && f.key === "connectors" ? "col-span-2" : undefined}>
          <label className="text-xs font-medium text-muted-foreground">
            {f.label}{f.unit ? ` (${f.unit})` : ""}{f.required ? " *" : ""}
          </label>
          <SpecInput field={f} value={values[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} />
        </div>
      ))}
    </div>
  );
}

/** Two-step add: pick the device type (and how its data will arrive), then
 * fill in the fields that matter for that type. */
function AddDeviceDialog({
  open, onOpenChange, onCreated, initialType, onImportCsv,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
  initialType: AssetType; onImportCsv: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<AssetType>(initialType);
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [capacity, setCapacity] = useState("");
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const products = useProductCatalogue();
  const meta = ASSET_TYPE_META[type];

  const reset = () => {
    setStep(1); setName(""); setSite(""); setCapacity(""); setSpecs({});
    setManufacturer(""); setModel(""); setSerialNumber(""); setInstalledAt(""); setProductId("");
  };
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/assets", {
        name, type, site, capacity_kw: Number(capacity),
        specs: Object.fromEntries(Object.entries(specs).filter(([, v]) => v !== "")),
        manufacturer: manufacturer || undefined,
        model: model || undefined,
        serial_number: serialNumber || undefined,
        installed_at: installedAt || undefined,
        product_id: productId || undefined,
      });
      toast.success(`${type === "Vehicle" ? "Vehicle" : "Device"} added`);
      close(false);
      onCreated();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Could not add the device — please check the fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Add a device" : `Add ${type === "EV Charger" ? "an EV charger" : type === "Vehicle" ? "a vehicle" : type === "Solar" ? "a solar array" : "a battery"}`}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-5 mt-1">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What are you adding?</div>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_TABS.map((t) => {
                  const Icon = t.icon;
                  const active = type === t.type;
                  return (
                    <button key={t.type} type="button" onClick={() => setType(t.type)}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-border hover:bg-accent"}`}>
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? "bg-emerald-500 text-white" : "bg-muted text-foreground"}`}><Icon size={18} /></span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{t.type === "Vehicle" ? "Fleet vehicle" : t.type}</span>
                        <span className="block text-[11px] text-muted-foreground">{t.type === "Vehicle" ? "Car, van, bus or truck" : t.type === "Solar" ? "PV array + inverter" : t.type === "Battery" ? "Storage system" : "Charge point"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">How will its data arrive?</div>
              <div className="space-y-2">
                <button type="button" onClick={() => setStep(2)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent">
                  <Keyboard size={18} className="text-emerald-600 shrink-0" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-foreground">Enter it manually</span>
                    <span className="block text-[11px] text-muted-foreground">Add its details now; ANI™ simulates its readings until it&apos;s connected</span>
                  </span>
                </button>
                <button type="button" disabled={type === "Vehicle"} onClick={() => { close(false); onImportCsv(); }}
                  className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent">
                  <Upload size={18} className="text-emerald-600 shrink-0" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-foreground">Import a CSV</span>
                    <span className="block text-[11px] text-muted-foreground">{type === "Vehicle" ? "Not available for vehicles yet — add them one at a time" : "Bring in many at once from a spreadsheet"}</span>
                  </span>
                </button>
                <div className="w-full flex items-center gap-3 rounded-xl border border-dashed border-border p-3 opacity-70">
                  <Link2 size={18} className="text-muted-foreground shrink-0" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-foreground">Connect a data provider</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {type === "Vehicle" ? "Vehicle telematics" : type === "Solar" ? "Inverter cloud" : type === "Battery" ? "Battery management system" : "OCPP back office"} — live readings, automatically
                    </span>
                  </span>
                  <StatusPill tone="neutral" dot={false}>Coming soon</StatusPill>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 mt-1 max-h-[70vh] overflow-y-auto pr-1">
            <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft size={13} /> Change device type
            </button>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1"
                  placeholder={type === "Vehicle" ? "e.g. Van 12 – Ford E-Transit" : type === "Solar" ? "e.g. Warehouse roof" : type === "Battery" ? "e.g. Depot battery" : "e.g. Depot Rapid 1"} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{meta.siteLabel} *</label>
                <Input required value={site} onChange={(e) => setSite(e.target.value)} className="mt-1" placeholder="e.g. North Depot" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{meta.capacityLabel} *</label>
                <Input required type="number" min="0.1" step="any" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1" placeholder={meta.capacityHint} />
              </div>
            </div>

            <div className="pt-2 border-t border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {type === "Vehicle" ? "Vehicle details" : type === "Solar" ? "Array details" : type === "Battery" ? "Battery details" : "Charger details"}
            </div>
            <SpecFields type={type} values={specs} onChange={(k, v) => setSpecs((s) => ({ ...s, [k]: v }))} />

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
              <div>
                <label className="text-xs font-medium text-muted-foreground">Serial number</label>
                <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{type === "Vehicle" ? "In service since" : "Installed on"}</label>
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
                {saving ? "Adding…" : type === "Vehicle" ? "Add vehicle" : "Add device"}
              </Button>
            </DialogFooter>
          </form>
        )}
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
    <a href={`/marketplace/${productId}`} target="_blank" rel="noopener noreferrer"
      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium underline">
      {data.product.name}{data.vendor ? ` · ${data.vendor.name}` : ""}
    </a>
  );
}

/** The type-specific details of a registered device, editable in place. */
function SpecsSection({ asset, onSaved }: { asset: Asset; onSaved: () => void }) {
  const type = asset.type as AssetType;
  const meta = ASSET_TYPE_META[type];
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!meta) return null;

  const start = () => {
    setValues(Object.fromEntries(meta.fields.map((f) => [f.key, asset.specs?.[f.key] !== undefined ? String(asset.specs[f.key]) : ""])));
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/assets/${asset.id}`, { specs: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")) });
      toast.success("Details saved");
      setEditing(false);
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Could not save the details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {type === "Vehicle" ? "Vehicle details" : type === "Solar" ? "Array details" : type === "Battery" ? "Battery details" : "Charger details"}
        </div>
        {!editing && (
          <Button variant="link" size="sm" onClick={start} className="h-auto p-0 text-xs font-semibold text-emerald-600 gap-1">
            <PenLine size={12} /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <SpecFields type={type} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          {meta.fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="font-medium text-foreground">{specLabel(f, asset.specs?.[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function AssetDetailSheet({ id, onOpenChange, onChanged }: { id: string | null; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const { data, error, mutate } = useSWR<Asset>(id ? `/assets/${id}` : null, fetcher);
  const [busy, setBusy] = useState(false);
  const isUserAsset = data?.source === "user";
  const meta = data ? ASSET_TYPE_META[data.type as AssetType] : undefined;

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
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
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
              <div><dt className="text-xs text-muted-foreground">{meta?.siteLabel ?? "Site"}</dt><dd className="font-medium text-foreground">{data.site}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{meta?.capacityLabel.replace(/ \(.*\)$/, "") ?? "Capacity"}</dt><dd className="font-medium text-foreground">{formatNumber(data.capacity_kw)} {data.type === "Solar" ? "kWp" : "kW"}</dd></div>
              {data.type !== "Vehicle" && (
                <>
                  <div><dt className="text-xs text-muted-foreground">Current Load</dt><dd className="font-medium text-foreground">{formatNumber(data.current_load_kw)} kW</dd></div>
                  {data.type === "EV Charger" && <div><dt className="text-xs text-muted-foreground">Ports</dt><dd className="font-medium text-foreground">{data.ports}</dd></div>}
                </>
              )}
            </dl>
            {data.type !== "Vehicle" && (
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Utilisation</span><span>{data.utilisation_pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.utilisation_pct}%` }} />
                </div>
              </div>
            )}
            {data.location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={13} /> {data.location.lat.toFixed(3)}, {data.location.lng.toFixed(3)}
              </div>
            )}

            {isUserAsset && <SpecsSection key={data.id} asset={data} onSaved={() => { mutate(); onChanged(); }} />}

            {isUserAsset && (data.manufacturer || data.model || data.serial_number || data.installed_at || data.product_id) && (
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Technical information</div>
                <dl className="grid grid-cols-2 gap-3">
                  {data.manufacturer && <div><dt className="text-xs text-muted-foreground">Manufacturer</dt><dd className="font-medium text-foreground">{data.manufacturer}</dd></div>}
                  {data.model && <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="font-medium text-foreground">{data.model}</dd></div>}
                  {data.serial_number && <div><dt className="text-xs text-muted-foreground">Serial number</dt><dd className="font-medium text-foreground">{data.serial_number}</dd></div>}
                  {data.installed_at && <div><dt className="text-xs text-muted-foreground">{data.type === "Vehicle" ? "In service since" : "Installed"}</dt><dd className="font-medium text-foreground">{new Date(data.installed_at).toLocaleDateString("en-GB")}</dd></div>}
                </dl>
                {data.product_id && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-0.5">Purchased from</div>
                    <LinkedProduct productId={data.product_id} />
                  </div>
                )}
              </div>
            )}

            {isUserAsset && data.type !== "Vehicle" && <RecentReadingsChart assetId={data.id} />}

            {isUserAsset && (
              <div className="border-t border-border pt-3">
                <Button variant="link" size="sm" onClick={remove} disabled={busy} className="h-auto p-0 text-xs font-semibold text-red-600 hover:text-red-700">
                  Remove this {data.type === "Vehicle" ? "vehicle" : "asset"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Columns that matter for each device type (the "All" view keeps the generic set). */
function columnsFor(type: AssetType | null): { head: string; align?: "right"; cell: (a: Asset) => React.ReactNode }[] {
  const spec = (a: Asset, k: string) => a.specs?.[k];
  const fieldOf = (t: AssetType, k: string) => ASSET_TYPE_META[t].fields.find((f) => f.key === k)!;
  const statusCol = { head: "Status", cell: (a: Asset) => <StatusPill tone={STATUS_TONE[a.status]}>{a.status}</StatusPill> };
  const utilCol = {
    head: "Utilisation",
    cell: (a: Asset) => (
      <div className="flex items-center gap-2 w-40">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.utilisation_pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground w-9 text-right">{a.utilisation_pct}%</span>
      </div>
    ),
  };
  switch (type) {
    case "Vehicle":
      return [
        { head: "Type", cell: (a) => VEHICLE_KINDS.find((k) => k.id === spec(a, "vehicleType"))?.label ?? "—" },
        { head: "Registration", cell: (a) => <span className="font-mono text-xs">{String(spec(a, "reg") ?? "—")}</span> },
        { head: "Home depot", cell: (a) => a.site },
        { head: "Driver", cell: (a) => String(spec(a, "driver") ?? "—") },
        { head: "Battery", align: "right", cell: (a) => specLabel(fieldOf("Vehicle", "batteryKwh"), spec(a, "batteryKwh")) },
        { head: "Max charge", align: "right", cell: (a) => `${formatNumber(a.capacity_kw)} kW` },
        statusCol,
      ];
    case "Solar":
      return [
        { head: "Site", cell: (a) => a.site },
        statusCol,
        { head: "Panels", align: "right", cell: (a) => specLabel(fieldOf("Solar", "panelCount"), spec(a, "panelCount")) },
        { head: "Orientation", cell: (a) => String(spec(a, "orientation") ?? "—") },
        { head: "Size", align: "right", cell: (a) => `${formatNumber(a.capacity_kw)} kWp` },
        { head: "Output now", align: "right", cell: (a) => `${formatNumber(a.current_load_kw)} kW` },
      ];
    case "Battery":
      return [
        { head: "Site", cell: (a) => a.site },
        statusCol,
        { head: "Chemistry", cell: (a) => String(spec(a, "chemistry") ?? "—") },
        { head: "Storage", align: "right", cell: (a) => specLabel(fieldOf("Battery", "capacityKwh"), spec(a, "capacityKwh")) },
        { head: "Power", align: "right", cell: (a) => `${formatNumber(a.capacity_kw)} kW` },
      ];
    default:
      return [
        ...(type ? [] : [{ head: "Type", cell: (a: Asset) => <span className="text-muted-foreground">{a.type}</span> }]),
        statusCol,
        utilCol,
        { head: "Ports", align: "right", cell: (a) => (a.type === "EV Charger" ? a.ports : "—") },
        { head: "Capacity", align: "right", cell: (a) => `${formatNumber(a.capacity_kw)} kW` },
        { head: "Load", align: "right", cell: (a) => (a.type === "Vehicle" ? "—" : `${formatNumber(a.current_load_kw)} kW`) },
      ];
  }
}

export default function AssetsPage() {
  const { data, error, mutate } = useSWR<Asset[]>("/assets", fetcher, { refreshInterval: 30000 });
  const { device, setDevice } = useDeviceType();
  const [showAll, setShowAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importReadingsOpen, setImportReadingsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const tab = showAll ? null : DEVICE_ASSET_TYPE[device];
  const tabMeta = tab ? TAB_FOR_TYPE[tab] : null;
  const all = data ?? [];
  const assets = tab ? all.filter((a) => a.type === tab) : all;
  const healthy = assets.filter((a) => a.status === "healthy").length;
  const totalCapacity = assets.reduce((s, a) => s + a.capacity_kw, 0);
  const specSum = (k: string) => assets.reduce((s, a) => s + (Number(a.specs?.[k]) || 0), 0);
  const cols = columnsFor(tab);
  const mine = assets.filter((a) => a.source === "user").length;

  const extraKpi = (): { label: string; value: React.ReactNode; unit?: string; icon: LucideIcon } => {
    switch (tab) {
      case "Vehicle": return { label: "Fleet Battery", value: formatNumber(specSum("batteryKwh")), unit: "kWh", icon: BatteryCharging };
      case "Solar": return { label: "Panels", value: formatNumber(specSum("panelCount")), icon: Sun };
      case "Battery": return { label: "Storage", value: formatNumber(specSum("capacityKwh")), unit: "kWh", icon: BatteryCharging };
      case "EV Charger": return { label: "Total Ports", value: assets.reduce((s, a) => s + a.ports, 0), icon: Plug };
      default: return { label: "Device Types", value: new Set(assets.map((a) => a.type)).size, icon: Layers };
    }
  };
  const extra = extraKpi();

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Every device you run — chargers, solar, batteries and vehicles — in one register."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <Upload size={16} /> Import CSV
            </Button>
            <Button variant="outline" onClick={() => setImportReadingsOpen(true)} className="gap-2">
              <TrendingUp size={16} /> Import Readings
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus size={16} /> {tab === "Vehicle" ? "Add vehicle" : "Add device"}
            </Button>
          </div>
        }
      />

      {/* Device tabs — follow (and drive) the Energy Devices switcher. */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        <button onClick={() => setShowAll(true)}
          className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition ${!tab ? "bg-emerald-600 border-emerald-600 text-white" : "bg-card border-border text-foreground hover:bg-accent"}`}>
          <Boxes size={15} /> All devices
          <span className={`text-[11px] rounded-full px-1.5 ${!tab ? "bg-white/20" : "bg-muted"}`}>{all.length}</span>
        </button>
        {TYPE_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.type;
          return (
            <button key={t.type} onClick={() => { setShowAll(false); setDevice(t.device); }}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition ${active ? "bg-emerald-600 border-emerald-600 text-white" : "bg-card border-border text-foreground hover:bg-accent"}`}>
              <Icon size={15} /> {t.label}
              <span className={`text-[11px] rounded-full px-1.5 ${active ? "bg-white/20" : "bg-muted"}`}>{all.filter((a) => a.type === t.type).length}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label={tabMeta ? tabMeta.label : "Total Devices"} value={assets.length} icon={tabMeta?.icon ?? Boxes} tone="mint" caption={`${mine} added by you`} />
            <KpiCard label="Healthy" value={assets.length ? `${Math.round((healthy / assets.length) * 100)}%` : "—"} icon={ShieldCheck} tone="sky" caption={`${healthy} of ${assets.length}`} />
            <KpiCard label={extra.label} value={extra.value} unit={extra.unit} icon={extra.icon} tone="lavender" />
            <KpiCard label={tab === "Vehicle" ? "Charging Capacity" : tab === "Solar" ? "Installed" : "Total Capacity"}
              value={formatNumber(totalCapacity)} unit={tab === "Solar" ? "kWp" : "kW"} icon={Gauge} tone="peach" />
          </>
        )}
      </div>

      {tab === "Vehicle" && data && mine === 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <Truck size={20} className="text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-[220px] text-sm">
            <div className="font-semibold text-emerald-900">No vehicles registered yet</div>
            <div className="text-emerald-800/80">Your Fleet dashboard is showing demo vehicles. Add your own and they&apos;ll replace the demo fleet there and on the map.</div>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus size={16} /> Add vehicle</Button>
        </div>
      )}

      <Panel className="mt-4" title={tabMeta ? `${tabMeta.label} register` : "Asset register"} bodyClassName="p-0">
        {!data ? (
          <div className="p-5"><Skeleton className="h-64" /></div>
        ) : !assets.length ? (
          <EmptyBox message={tabMeta ? `No ${tabMeta.plural} yet — use “${tab === "Vehicle" ? "Add vehicle" : "Add device"}” to register one.` : "No data yet."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">
                <TableHead className="px-5 py-3">{tab === "Vehicle" ? "Vehicle" : tab === "Solar" ? "Array" : tab === "Battery" ? "Battery" : "Asset"}</TableHead>
                {cols.map((c) => <TableHead key={c.head} className={`px-5 py-3 ${c.align === "right" ? "text-right" : ""}`}>{c.head}</TableHead>)}
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
                  {cols.map((c) => (
                    <TableCell key={c.head} className={`px-5 py-3 text-foreground/80 ${c.align === "right" ? "text-right" : ""}`}>{c.cell(a)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {/* Remounted on each open so it starts on the current tab's type. */}
      <AddDeviceDialog
        key={addOpen ? `open-${tab ?? "all"}` : "closed"}
        open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()}
        initialType={tab ?? "EV Charger"} onImportCsv={() => setImportOpen(true)}
      />
      <CsvImportDialog
        open={importOpen} onOpenChange={setImportOpen} onImported={() => mutate()}
        title="Import assets from CSV" endpoint="/assets/import" template={ASSETS_CSV_TEMPLATE}
        columnsHint="Columns: name, type, site, capacity_kw (required); manufacturer, model, serial_number, installed_at (optional). Type must be EV Charger, Battery or Solar — add vehicles with Add vehicle."
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
