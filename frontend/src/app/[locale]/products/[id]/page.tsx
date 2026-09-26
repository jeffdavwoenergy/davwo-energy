"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, FileText, Download, MessageCircle, Loader2, ShieldCheck, MapPin, LifeBuoy } from "lucide-react";
import api from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Vendor {
  id: string;
  name: string;
  region: string;
  verified: boolean;
  website: string;
}

interface Product {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  specs?: Record<string, string>;
  priceNote?: string;
}

interface DocumentMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasExtractedText: boolean;
}

interface KBEntry {
  id: string;
  issue: string;
  symptoms?: string;
  resolution: string;
}

interface AskResult {
  answer: string;
  groundedIn: { productId: string; productName: string; documentCount: number; knowledgeBaseCount: number }[];
  configured: boolean;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [kbEntries, setKbEntries] = useState<KBEntry[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResult | null>(null);

  useEffect(() => {
    api
      .get(`/marketplace/products/${id}`)
      .then(({ data }) => {
        setProduct(data.product);
        setVendor(data.vendor);
        setDocuments(data.documents);
      })
      .catch(() => setNotFound(true));
    api
      .get(`/marketplace/products/${id}/knowledgebase`)
      .then(({ data }) => setKbEntries(data.entries))
      .catch(() => {});
  }, [id]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const { data } = await api.post<AskResult>("/marketplace/ask", { productIds: [id], question });
      setAnswer(data);
    } catch {
      setAnswer({ answer: "Something went wrong asking that question — please try again.", groundedIn: [], configured: true });
    } finally {
      setAsking(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Product not found.</p>
        <Link href="/products" className="text-emerald-600 font-semibold">← Back to search</Link>
      </div>
    );
  }

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15} /> Back to search
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        <Card className="p-6">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">{product.category}</span>
          <h1 className="mt-1 text-2xl font-display font-bold text-foreground">{product.name}</h1>
          <p className="mt-2 text-muted-foreground">{product.summary}</p>

          {vendor && (
            <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground/80">{vendor.name}</span>
              {vendor.verified && (
                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                  <ShieldCheck size={13} /> Verified
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs"><MapPin size={12} /> {vendor.region}</span>
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>

          {product.specs && Object.keys(product.specs).length > 0 && (
            <div className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-4">
              {Object.entries(product.specs).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium text-foreground">{v}</span>
                </div>
              ))}
            </div>
          )}

          {product.priceNote && (
            <div className="mt-4 text-sm font-semibold text-foreground">{product.priceNote}</div>
          )}
        </Card>

        {documents.length > 0 && (
          <Card className="p-6">
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <FileText size={17} className="text-muted-foreground" /> Manuals &amp; spec sheets
            </h2>
            <div className="mt-3 space-y-2">
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={`/api/marketplace/products/${id}/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 transition text-sm"
                >
                  <span className="text-foreground/80 font-medium">{doc.filename}</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                    <Download size={14} /> {formatFileSize(doc.sizeBytes)}
                  </span>
                </a>
              ))}
            </div>
          </Card>
        )}

        {kbEntries.length > 0 && (
          <Card className="p-6">
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <LifeBuoy size={17} className="text-muted-foreground" /> Known issues &amp; fixes
            </h2>
            <div className="mt-3 space-y-3">
              {kbEntries.map((e) => (
                <div key={e.id} className="rounded-xl border border-border p-4">
                  <div className="text-sm font-semibold text-foreground">{e.issue}</div>
                  {e.symptoms && <p className="text-xs text-muted-foreground mt-1">Symptoms: {e.symptoms}</p>}
                  <p className="text-sm text-muted-foreground mt-1.5">{e.resolution}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="bg-gradient-to-br from-navy to-navy-2 text-white rounded-2xl p-6">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <MessageCircle size={18} className="text-emerald-300" /> Ask ANI&#8482; — specs or technical support
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Grounded in {product.name}&rsquo;s specs, documentation and known issues — and general technical
            knowledge for broader questions. If it&rsquo;s a hands-on fault this can&rsquo;t diagnose, ANI&#8482;
            will point you to {vendor?.name ?? "the vendor"} or your nearest technical support centre instead of guessing.
          </p>
          <form onSubmit={ask} className="mt-4 flex flex-col sm:flex-row gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What's the maximum charging current? Does it support load balancing?"
              className="flex-1 rounded-xl bg-white/10 border-white/20 placeholder:text-slate-400 text-white focus-visible:ring-emerald-400"
            />
            <Button type="submit" disabled={asking} className="gap-2">
              {asking ? <><Loader2 size={16} className="animate-spin" /> Thinking…</> : "Ask"}
            </Button>
          </form>
          {answer && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-slate-100 whitespace-pre-line">
              {answer.answer}
              {!answer.configured && (
                <div className="mt-2 text-xs text-amber-300">AI narration isn&rsquo;t configured on this deployment yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
