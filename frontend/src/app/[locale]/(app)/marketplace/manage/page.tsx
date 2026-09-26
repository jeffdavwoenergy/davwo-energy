"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, Upload, FileText, Loader2, PackagePlus, ShieldCheck, ShieldOff, Building2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatFileSize } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel from "@/components/shared/Panel";
import ProductKnowledgeBase from "@/components/shared/ProductKnowledgeBase";
import type { Vendor, VendorCategory } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Product {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  summary: string;
  priceNote?: string;
}
interface DocumentMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  hasExtractedText: boolean;
}
interface Supplier {
  id: string;
  companyName: string;
  email: string;
  category: string;
  region?: string;
  verified: boolean;
}

function DocumentUpload({ productId, onUploaded }: { productId: string; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post(`/marketplace/products/${productId}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Uploaded ${file.name}`);
      onUploaded();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not upload that document.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer">
      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
      {uploading ? "Uploading…" : "Upload manual (PDF/txt)"}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,text/plain"
        className="hidden"
        disabled={uploading}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
    </label>
  );
}

function ProductRow({ product, vendors, onRemoved }: { product: Product; vendors: Vendor[]; onRemoved: () => void }) {
  const { data: docs, mutate } = useSWR<{ documents: DocumentMeta[] }>(`/marketplace/products/${product.id}/documents`, fetcher);
  const vendor = vendors.find((v) => v.id === product.vendorId);
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (!window.confirm(`Remove "${product.name}" from the marketplace?`)) return;
    setRemoving(true);
    try {
      await api.delete(`/marketplace/products/${product.id}`);
      toast.success(`Removed ${product.name}`);
      onRemoved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not remove that listing.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{product.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{vendor?.name ?? product.vendorId} · {product.category}</div>
          <p className="text-xs text-muted-foreground mt-1">{product.summary}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <DocumentUpload productId={product.id} onUploaded={() => mutate()} />
          <Button variant="ghost" size="icon" onClick={remove} disabled={removing} aria-label={`Remove ${product.name}`}
            className="h-auto w-auto p-0 text-muted-foreground hover:bg-transparent hover:text-red-600">
            <Trash2 size={15} />
          </Button>
        </div>
      </div>
      {docs && docs.documents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          {docs.documents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText size={12} />
              {d.filename} · {formatFileSize(d.sizeBytes)}
              {!d.hasExtractedText && <span className="text-amber-600">(no extractable text)</span>}
            </div>
          ))}
        </div>
      )}
      <ProductKnowledgeBase productId={product.id} basePath="/marketplace/products" client={api} />
    </div>
  );
}

function SuppliersPanel() {
  const { data, mutate } = useSWR<{ suppliers: Supplier[] }>("/marketplace/suppliers", fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleVerified = async (supplier: Supplier) => {
    setBusyId(supplier.id);
    try {
      await api.patch(`/marketplace/suppliers/${supplier.id}`, { verified: !supplier.verified });
      toast.success(supplier.verified ? `${supplier.companyName} unverified` : `${supplier.companyName} verified`);
      await mutate();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not update that supplier.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel title="Suppliers" subtitle="Real, self-registered supplier accounts — verify a company once you've confirmed it's legitimate." right={<Building2 size={18} className="text-muted-foreground" />}>
      {!data ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : data.suppliers.length === 0 ? (
        <div className="text-sm text-muted-foreground">No suppliers have registered yet.</div>
      ) : (
        <div className="space-y-2">
          {data.suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between border border-border rounded-xl p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{s.companyName}</div>
                <div className="text-xs text-muted-foreground truncate">{s.email} · {s.category}{s.region ? ` · ${s.region}` : ""}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleVerified(s)}
                disabled={busyId === s.id}
                className={`h-auto shrink-0 gap-1.5 py-1.5 text-xs ${
                  s.verified ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300" : "text-muted-foreground"
                }`}
              >
                {s.verified ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                {s.verified ? "Verified" : "Unverified"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function ManageProductsPage() {
  const { user } = useAuth();
  const { data: vendorData } = useSWR<{ vendors: Vendor[]; categories: { id: VendorCategory; label: string }[] }>("/marketplace/vendors", fetcher);
  const { data: productData, mutate: mutateProducts } = useSWR<{ products: Product[] }>("/marketplace/products", fetcher);

  const [vendorId, setVendorId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [specs, setSpecs] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [saving, setSaving] = useState(false);

  if (user && user.role !== "admin") {
    return (
      <div className="text-center py-20 text-muted-foreground text-sm">
        Only admins can manage the product catalogue.
      </div>
    );
  }

  const updateSpec = (i: number, field: "key" | "value", v: string) => {
    setSpecs((list) => list.map((s, idx) => (idx === i ? { ...s, [field]: v } : s)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const specsObj = Object.fromEntries(specs.filter((s) => s.key.trim()).map((s) => [s.key.trim(), s.value.trim()]));
      await api.post("/marketplace/products", {
        vendorId, name, category, summary, description,
        priceNote: priceNote || undefined,
        specs: Object.keys(specsObj).length ? specsObj : undefined,
      });
      toast.success(`Added ${name}`);
      setName(""); setSummary(""); setDescription(""); setPriceNote(""); setSpecs([{ key: "", value: "" }]);
      await mutateProducts();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not add that product.");
    } finally {
      setSaving(false);
    }
  };

  const vendors = vendorData?.vendors ?? [];
  const categories = vendorData?.categories ?? [];

  return (
    <div>
      <PageHeader title="Manage Products" subtitle="Add products to the marketplace catalogue and upload manuals/spec sheets so ANI™ can answer technical questions grounded in them." />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Add a product" right={<PackagePlus size={18} className="text-muted-foreground" />}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <Select required value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Product name</label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select required value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Summary (one line)</label>
              <Input required maxLength={240} value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Price note (optional)</label>
              <Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="e.g. From £4,500 installed" className="mt-1" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Technical specs (optional)</label>
              <div className="space-y-2 mt-1">
                {specs.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="e.g. Max output" value={s.key} onChange={(e) => updateSpec(i, "key", e.target.value)} />
                    <Input placeholder="e.g. 50 kW" value={s.value} onChange={(e) => updateSpec(i, "value", e.target.value)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setSpecs((list) => list.filter((_, idx) => idx !== i))} className="shrink-0 text-muted-foreground hover:text-red-600">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="link" size="sm" onClick={() => setSpecs((list) => [...list, { key: "", value: "" }])} className="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Plus size={13} /> Add spec
                </Button>
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add product"}
            </Button>
          </form>
        </Panel>

        <Panel title="Catalogue" subtitle="Upload a manual to ground ANI™'s answers for that product.">
          <div className="space-y-3">
            {!productData ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : productData.products.length === 0 ? (
              <div className="text-sm text-muted-foreground">No products yet — add one on the left.</div>
            ) : (
              productData.products.map((p) => <ProductRow key={p.id} product={p} vendors={vendors} onRemoved={() => mutateProducts()} />)
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <SuppliersPanel />
      </div>
    </div>
  );
}
