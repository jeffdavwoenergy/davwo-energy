"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import useSWR from "swr";
import { Plus, Upload, FileText, Loader2, PackagePlus, LogOut, Inbox, Mail } from "lucide-react";
import { toast } from "sonner";
import supplierApi, { getSupplierToken, clearSupplierToken } from "@/lib/supplierApi";
import { formatFileSize } from "@/lib/format";
import ProductKnowledgeBase from "@/components/shared/ProductKnowledgeBase";
import type { LeadStatus } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const CATEGORIES = [
  { id: "ev-chargers", label: "EV Chargers" },
  { id: "battery", label: "Battery Solutions" },
  { id: "solar", label: "Solar Solutions" },
  { id: "energy-services", label: "Energy Services" },
  { id: "consulting", label: "Consulting Services" },
];

interface Supplier {
  id: string;
  companyName: string;
  email: string;
  category: string;
  verified: boolean;
}
interface Product {
  id: string;
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
interface Lead {
  id: string;
  name: string;
  email: string;
  message: string;
  status: LeadStatus;
  response?: string;
  createdAt: string;
}

const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-muted text-muted-foreground",
  responded: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  accepted: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

const supplierFetcher = (url: string) => supplierApi.get(url).then((r) => r.data);

function DocumentUpload({ productId, onUploaded }: { productId: string; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await supplierApi.post(`/supplier/products/${productId}/documents`, form, {
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
      <input ref={fileRef} type="file" accept="application/pdf,text/plain" className="hidden" disabled={uploading}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </label>
  );
}

function ProductRow({ product }: { product: Product }) {
  const { data: docs, mutate } = useSWR<{ documents: DocumentMeta[] }>(`/supplier/products/${product.id}/documents`, supplierFetcher);
  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{product.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{product.category}</div>
          <p className="text-xs text-muted-foreground mt-1">{product.summary}</p>
        </div>
        <DocumentUpload productId={product.id} onUploaded={() => mutate()} />
      </div>
      {docs && docs.documents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          {docs.documents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText size={12} /> {d.filename} · {formatFileSize(d.sizeBytes)}
              {!d.hasExtractedText && <span className="text-amber-600">(no extractable text)</span>}
            </div>
          ))}
        </div>
      )}
      <ProductKnowledgeBase productId={product.id} basePath="/supplier/products" client={supplierApi} />
    </div>
  );
}

function LeadRow({ lead, onResponded }: { lead: Lead; onResponded: () => void }) {
  const [response, setResponse] = useState("");
  const [sending, setSending] = useState(false);

  const respond = async () => {
    const text = response.trim();
    if (!text) return;
    setSending(true);
    try {
      await supplierApi.patch(`/supplier/leads/${lead.id}`, { response: text });
      toast.success("Response sent");
      onResponded();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not send that response.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{lead.name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${LEAD_STATUS_TONE[lead.status]}`}>{lead.status}</span>
          <span className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail size={11} /> {lead.email}</div>
      <p className="text-sm text-muted-foreground mt-1.5">{lead.message}</p>
      {lead.response && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[11px] font-medium text-muted-foreground">Your response</div>
          <p className="text-sm text-foreground/80 mt-0.5">{lead.response}</p>
        </div>
      )}
      {lead.status === "new" && (
        <div className="mt-2.5 flex items-center gap-2">
          <Input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Reply to this enquiry…" />
          <Button
            onClick={respond} disabled={sending || !response.trim()}
            size="sm" variant="secondary"
            className="h-auto shrink-0 py-2 text-xs"
          >
            {sending ? "Sending…" : "Respond"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SupplierDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSupplierToken()) {
      router.replace("/supplier/login");
      return;
    }
    // localStorage is a browser-only external system unavailable during SSR
    // (ready must start false to match the server render) — this is the
    // "synchronize with an external system on mount" case the lint rule
    // doesn't intend to block, same rationale as auth.tsx's refresh() call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [router]);

  const { data: supplier } = useSWR<Supplier>(ready ? "/supplier/auth/me" : null, supplierFetcher);
  const { data: productData, mutate: mutateProducts } = useSWR<{ products: Product[] }>(ready ? "/supplier/products" : null, supplierFetcher);
  const { data: leadData, mutate: mutateLeads } = useSWR<{ leads: Lead[] }>(ready ? "/supplier/leads" : null, supplierFetcher);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [saving, setSaving] = useState(false);

  const logout = () => {
    clearSupplierToken();
    router.push("/supplier/login");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supplierApi.post("/supplier/products", { name, category, summary, description, priceNote: priceNote || undefined });
      toast.success(`Added ${name}`);
      setName(""); setSummary(""); setDescription(""); setPriceNote("");
      await mutateProducts();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not add that product.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Davwo Supplier Portal</div>
            <div className="font-display font-semibold">{supplier?.companyName ?? "…"}</div>
          </div>
          <Button onClick={logout} variant="ghost" className="gap-1.5 text-slate-300 hover:bg-transparent hover:text-white">
            <LogOut size={15} /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PackagePlus size={18} className="text-muted-foreground" />
            <h2 className="font-display font-semibold text-foreground">Add a product</h2>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Product name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select required value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <Button type="submit" disabled={saving} className="gap-2">
              <Plus size={15} /> {saving ? "Adding…" : "Add product"}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display font-semibold text-foreground mb-3">Your listings</h2>
            <div className="space-y-3">
              {!productData ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : productData.products.length === 0 ? (
                <div className="text-sm text-muted-foreground">No products yet — add one on the left.</div>
              ) : (
                productData.products.map((p) => <ProductRow key={p.id} product={p} />)
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Inbox size={18} className="text-muted-foreground" />
              <h2 className="font-display font-semibold text-foreground">Enquiries</h2>
            </div>
            <div className="space-y-2">
              {!leadData ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : leadData.leads.length === 0 ? (
                <div className="text-sm text-muted-foreground">No enquiries yet.</div>
              ) : (
                leadData.leads.map((l) => <LeadRow key={l.id} lead={l} onResponded={() => mutateLeads()} />)
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
