"use client";

import { useRef, useState } from "react";
import { Plus, X, ImagePlus, Save, Eye, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import supplierApi from "@/lib/supplierApi";
import { mapSupplierProduct, stockImagesFor, type SupplierProduct } from "@/lib/supplierCatalog";
import { formatGBP } from "@/lib/marketplaceMock";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { ProductDetailView } from "@/components/marketplace/ProductDetailView";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SpecIcon } from "@/components/marketplace/SpecIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Mirrors the server-side limits in lib/server/products.ts.
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_KEY_SPECS = 6;
const MAX_FEATURES = 8;
const CONTRACT_TERMS = [24, 36, 48, 60];

export const CATEGORIES = [
  { id: "ev-chargers", label: "EV Chargers" },
  { id: "battery", label: "Battery Solutions" },
  { id: "solar", label: "Solar Solutions" },
  { id: "energy-services", label: "Energy Services" },
  { id: "consulting", label: "Consulting Services" },
];
const TERM_TYPES = [
  { id: "finance", label: "Finance" },
  { id: "lease", label: "Lease" },
  { id: "subscription", label: "Subscription" },
];
const SPEC_ICONS = [
  { id: "zap", label: "Power" },
  { id: "plug", label: "Connector" },
  { id: "battery", label: "Battery" },
  { id: "sun", label: "Solar" },
  { id: "activity", label: "Smart / app" },
  { id: "gauge", label: "Performance" },
  { id: "shield", label: "Certified / warranty" },
  { id: "check", label: "General" },
  { id: "home", label: "Install" },
  { id: "layers", label: "Other" },
];

interface SpecRow { label: string; value: string; icon: string }
interface KvRow { key: string; value: string }
interface NewPhoto { file: File; dataUrl: string }

const inputCls = "mt-1";
const labelCls = "text-xs font-medium text-muted-foreground";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </fieldset>
  );
}

const str = (n?: number) => (n === undefined ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/**
 * The supplier's add/edit listing form — one section per part of the
 * marketplace card, detail page and plan builder, with a live preview of
 * the exact card buyers will see. Pass `initial` to edit an existing listing.
 */
export function ProductListingForm({
  supplierName,
  initial,
  onSaved,
  onCancel,
}: {
  supplierName: string;
  initial?: SupplierProduct;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const l = initial?.listing ?? {};
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(l.brand ?? "");
  const [variant, setVariant] = useState(l.variant ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const [monthly, setMonthly] = useState(str(l.monthlyPrice));
  const [upfront, setUpfront] = useState(str(l.upfrontPayment));
  const [contractMonths, setContractMonths] = useState(String(l.contractMonths ?? 36));
  const [termType, setTermType] = useState<string>(l.termType ?? "finance");
  const [outright, setOutright] = useState(str(l.outrightPrice));

  const [hasMaintenance, setHasMaintenance] = useState(Boolean(l.maintenanceMonthly));
  const [maintenanceMonthly, setMaintenanceMonthly] = useState(str(l.maintenanceMonthly));
  const [maintenanceLabel, setMaintenanceLabel] = useState(l.maintenanceLabel ?? "");

  const [keySpecs, setKeySpecs] = useState<SpecRow[]>(l.keySpecs?.length ? l.keySpecs : [{ label: "", value: "", icon: "zap" }]);
  const [features, setFeatures] = useState<string[]>(l.features?.length ? l.features : [""]);
  const [detailed, setDetailed] = useState<KvRow[]>(
    initial?.specs && Object.keys(initial.specs).length
      ? Object.entries(initial.specs).map(([key, value]) => ({ key, value: String(value) }))
      : [{ key: "", value: "" }],
  );

  const [installEstimate, setInstallEstimate] = useState(l.installEstimate ?? "");
  const [stockNote, setStockNote] = useState(l.stockNote ?? "");

  const [existingImageIds, setExistingImageIds] = useState<string[]>(initial?.imageIds ?? []);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);

  const photoCount = existingImageIds.length + newPhotos.length;
  const existingUrls = existingImageIds.map((imgId) => `/api/marketplace/products/${initial?.id}/images/${imgId}`);
  const galleryUrls = [...existingUrls, ...newPhotos.map((p) => p.dataUrl)];

  const addPhotos = (files: FileList) => {
    const room = MAX_IMAGES - photoCount;
    const picked = [...files].slice(0, Math.max(0, room));
    if (files.length > room) toast.error(`A listing can have at most ${MAX_IMAGES} photos.`);
    for (const file of picked) {
      if (!IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: photos must be JPEG, PNG or WebP.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 3MB.`);
        continue;
      }
      // data: URL rather than blob: — the CSP's img-src allows data: but not blob:.
      const reader = new FileReader();
      reader.onload = () => setNewPhotos((prev) => [...prev, { file, dataUrl: String(reader.result) }]);
      reader.readAsDataURL(file);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const listing = {
    brand: brand.trim() || undefined,
    variant: variant.trim() || undefined,
    monthlyPrice: num(monthly),
    upfrontPayment: num(upfront),
    contractMonths: Number(contractMonths),
    termType: termType as "finance" | "lease" | "subscription",
    outrightPrice: num(outright),
    maintenanceMonthly: hasMaintenance ? num(maintenanceMonthly) : undefined,
    maintenanceLabel: hasMaintenance ? maintenanceLabel.trim() || undefined : undefined,
    keySpecs: keySpecs.filter((s) => s.label.trim() && s.value.trim()).map((s) => ({ ...s, label: s.label.trim(), value: s.value.trim() })),
    features: features.map((f) => f.trim()).filter(Boolean),
    installEstimate: installEstimate.trim() || undefined,
    stockNote: stockNote.trim() || undefined,
  };
  const specs = Object.fromEntries(detailed.filter((r) => r.key.trim() && r.value.trim()).map((r) => [r.key.trim(), r.value.trim()]));

  const preview = mapSupplierProduct(
    {
      id: initial?.id ?? "preview",
      vendorId: "",
      vendorName: supplierName,
      name: name || "Product name",
      category: category || "energy-services",
      summary: summary || "One-line summary",
      description,
      specs,
      listing,
      createdAt: "",
    },
    galleryUrls.length ? galleryUrls : initial?.listing?.gallery?.length ? initial.listing.gallery : stockImagesFor(category),
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      toast.error("Choose a category.");
      return;
    }
    if (listing.monthlyPrice === undefined) {
      toast.error("Add a monthly price — it's the headline price buyers plan with.");
      return;
    }
    if (hasMaintenance && listing.maintenanceMonthly === undefined) {
      toast.error("Add a monthly price for the maintenance plan, or switch it off.");
      return;
    }
    setSaving(true);
    try {
      const body = { name, category, summary, description, specs, priceNote: initial?.priceNote, listing };
      const { data: saved } = initial
        ? await supplierApi.patch(`/supplier/products/${initial.id}`, body)
        : await supplierApi.post("/supplier/products", body);

      // Photos go up after the product exists; a failed photo doesn't lose the listing.
      let failed = 0;
      for (const imgId of removedImageIds) {
        await supplierApi.delete(`/supplier/products/${saved.id}/images/${imgId}`).catch(() => failed++);
      }
      for (const photo of newPhotos) {
        const form = new FormData();
        form.append("file", photo.file);
        await supplierApi
          .post(`/supplier/products/${saved.id}/images`, form, { headers: { "Content-Type": "multipart/form-data" } })
          .catch(() => failed++);
      }
      if (failed) toast.error(`Listing saved, but ${failed} photo change${failed > 1 ? "s" : ""} failed — try again from Edit.`);
      else toast.success(initial ? `Updated ${name}` : `Listed ${name}`);
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not save that listing.");
    } finally {
      setSaving(false);
    }
  };

  const term = Number(contractMonths);
  const monthlyNum = listing.monthlyPrice ?? 0;

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="space-y-5 min-w-0">
        <Section title="Product" hint="The name and subtitle buyers see on the listing card.">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Product / model name</label>
              <Input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wallbox Pro" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Brand (optional)</label>
              <Input maxLength={80} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={supplierName} className={inputCls} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Card subtitle (optional)</label>
              <Input maxLength={120} value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="e.g. 7.4kW smart home charger" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Summary (one line, used in search)</label>
            <Input required maxLength={240} value={summary} onChange={(e) => setSummary(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <Textarea required rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 resize-y" />
          </div>
        </Section>

        <Section title="Photos" hint={`Up to ${MAX_IMAGES} JPEG, PNG or WebP photos, 3MB each. The first is the card image.`}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {existingImageIds.map((imgId, i) => (
              <div key={imgId} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={existingUrls[i]} alt="" className="w-full h-full object-cover" />
                <button type="button" aria-label="Remove photo"
                  onClick={() => { setExistingImageIds((p) => p.filter((x) => x !== imgId)); setRemovedImageIds((p) => [...p, imgId]); }}
                  className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80"><X size={12} /></button>
              </div>
            ))}
            {newPhotos.map((p, i) => (
              <div key={p.dataUrl.slice(-32) + i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                <button type="button" aria-label="Remove photo"
                  onClick={() => setNewPhotos((prev) => prev.filter((x) => x !== p))}
                  className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80"><X size={12} /></button>
              </div>
            ))}
            {photoCount < MAX_IMAGES && (
              <label className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 cursor-pointer">
                <ImagePlus size={18} /> Add
                <input ref={fileRef} type="file" multiple accept={IMAGE_TYPES.join(",")} className="hidden"
                  onChange={(e) => e.target.files && addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          {photoCount === 0 && <p className="text-xs text-muted-foreground">No photos yet — a stock {category ? "category " : ""}image is shown until you add one.</p>}
        </Section>

        <Section title="Plan pricing" hint="What buyers see and build their plan from. Prices include VAT; business buyers see them ex. VAT.">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Monthly price from (£)</label>
              <Input required type="number" min={0} step="0.01" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="e.g. 45" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Upfront payment (£)</label>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={upfront} onChange={(e) => setUpfront(e.target.value)} placeholder="0 = no deposit" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Outright price (£, optional)</label>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={outright} onChange={(e) => setOutright(e.target.value)} placeholder="e.g. 4500" className={inputCls} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Default contract length</label>
              <Select value={contractMonths} onValueChange={setContractMonths}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_TERMS.map((m) => <SelectItem key={m} value={String(m)}>{m} months</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Agreement type</label>
              <Select value={termType} onValueChange={setTermType}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERM_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Buyers can also pick 24–60 month terms and 1–12 months upfront; the plan builder adjusts from your price at the default term.
          </p>
        </Section>

        <Section title="Maintenance plan" hint="An optional monthly add-on buyers can tick when building their plan.">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={hasMaintenance} onCheckedChange={setHasMaintenance} /> Offer a maintenance plan
          </label>
          {hasMaintenance && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Monthly price (£)</label>
                <Input type="number" min={0} step="0.01" inputMode="decimal" value={maintenanceMonthly} onChange={(e) => setMaintenanceMonthly(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>What it&apos;s called</label>
                <Input maxLength={60} value={maintenanceLabel} onChange={(e) => setMaintenanceLabel(e.target.value)} placeholder="e.g. monitoring & priority support" className={inputCls} />
              </div>
            </div>
          )}
        </Section>

        <Section title="Key specs" hint={`Up to ${MAX_KEY_SPECS} headline specs, shown as icon tiles on the card and listing page.`}>
          {keySpecs.map((s, i) => (
            <div key={i} className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
              <Select value={s.icon} onValueChange={(icon) => setKeySpecs((p) => p.map((x, j) => (j === i ? { ...x, icon } : x)))}>
                <SelectTrigger aria-label="Icon"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPEC_ICONS.map((ic) => (
                    <SelectItem key={ic.id} value={ic.id}>
                      <span className="flex items-center gap-2"><SpecIcon icon={ic.id} className="w-3.5 h-3.5 shrink-0" /> {ic.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input maxLength={40} value={s.label} onChange={(e) => setKeySpecs((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label, e.g. Power" />
              <Input maxLength={60} value={s.value} onChange={(e) => setKeySpecs((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value, e.g. 7.4 kW" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove spec" onClick={() => setKeySpecs((p) => p.filter((_, j) => j !== i))}><X size={14} /></Button>
            </div>
          ))}
          {keySpecs.length < MAX_KEY_SPECS && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setKeySpecs((p) => [...p, { label: "", value: "", icon: "check" }])}>
              <Plus size={14} /> Add spec
            </Button>
          )}
        </Section>

        <Section title="Features" hint={`Up to ${MAX_FEATURES} selling points, listed under "Features" on the listing page.`}>
          {features.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input maxLength={160} value={f} onChange={(e) => setFeatures((p) => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder="e.g. Dynamic load balancing protects your main fuse" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove feature" onClick={() => setFeatures((p) => p.filter((_, j) => j !== i))}><X size={14} /></Button>
            </div>
          ))}
          {features.length < MAX_FEATURES && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setFeatures((p) => [...p, ""])}>
              <Plus size={14} /> Add feature
            </Button>
          )}
        </Section>

        <Section title="Full specification" hint="Detailed technical specs, shown in the listing's specification table.">
          {detailed.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
              <Input value={r.key} onChange={(e) => setDetailed((p) => p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="e.g. Max current" />
              <Input value={r.value} onChange={(e) => setDetailed((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="e.g. 32 A single phase" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => setDetailed((p) => p.filter((_, j) => j !== i))}><X size={14} /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDetailed((p) => [...p, { key: "", value: "" }])}>
            <Plus size={14} /> Add row
          </Button>
        </Section>

        <Section title="Delivery & installation">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Install / delivery time</label>
              <Input maxLength={80} value={installEstimate} onChange={(e) => setInstallEstimate(e.target.value)} placeholder="e.g. Certified install in 7–14 days" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Stock & what&apos;s included</label>
              <Input maxLength={160} value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="e.g. In stock — free site survey included" className={inputCls} />
            </div>
          </div>
        </Section>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={saving} className="gap-2">
            {initial ? <Save size={15} /> : <Plus size={15} />}
            {saving ? "Saving…" : initial ? "Save changes" : "Publish listing"}
          </Button>
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye size={13} /> Live preview — how buyers see it</div>
        {/* inert: the card is a real marketplace link, which doesn't exist yet for a draft */}
        <div inert className="pointer-events-none">
          <ProductCard product={preview} contractType="personal" isSaved={false} onToggleSave={() => {}} />
        </div>
        <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => setFullPreview(true)}>
          <Maximize2 size={14} /> Preview full listing page
        </Button>
        <div className="rounded-xl border border-border p-3 text-xs space-y-1.5">
          <div className="font-semibold text-foreground text-sm">Default plan</div>
          <div className="flex justify-between"><span className="text-muted-foreground">Monthly</span><span className="font-medium text-foreground">{formatGBP(monthlyNum, 2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Upfront</span><span className="font-medium text-foreground">{formatGBP(preview.baseInitialPayment, 2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Term</span><span className="font-medium text-foreground">{term} months, {termType}</span></div>
          {preview.outrightPrice !== undefined && (
            <div className="flex justify-between"><span className="text-muted-foreground">Buy outright</span><span className="font-medium text-foreground">{formatGBP(preview.outrightPrice)}</span></div>
          )}
          {preview.maintenanceCost > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">+ {preview.maintenanceLabel}</span><span className="font-medium text-foreground">{formatGBP(preview.maintenanceCost, 2)}/mo</span></div>
          )}
        </div>
      </aside>

      <Dialog open={fullPreview} onOpenChange={setFullPreview}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto bg-[#f8f9fa] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Full listing preview</DialogTitle>
            <DialogDescription>
              Your product page exactly as buyers see it — photos, overview, specs, features and the plan builder, built from
              what you&apos;ve entered so far. Try different terms in the plan builder; buyer buttons are disabled here.
            </DialogDescription>
          </DialogHeader>
          <ProductDetailView product={preview} preview />
        </DialogContent>
      </Dialog>
    </form>
  );
}
