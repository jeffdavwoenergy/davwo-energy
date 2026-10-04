"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Link } from "@/i18n/navigation";
import { Upload, FileText, Loader2, Pencil, ExternalLink, MoreHorizontal, BookOpen, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import supplierApi from "@/lib/supplierApi";
import { supplierFetcher, apiError } from "@/lib/supplierPortal";
import { formatFileSize } from "@/lib/format";
import { mapSupplierProduct, type SupplierProduct } from "@/lib/supplierCatalog";
import { formatGBP } from "@/lib/marketplaceMock";
import ProductKnowledgeBase from "@/components/shared/ProductKnowledgeBase";
import { CATEGORIES } from "@/components/supplier/ProductListingForm";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DocumentMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  hasExtractedText: boolean;
}

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
      toast.error(apiError(err, "Could not upload that document."));
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

/** Thumbnail, plan price and summary for one listing. */
function ListingSummary({ product }: { product: SupplierProduct }) {
  const card = mapSupplierProduct(product);
  const incomplete = product.listing?.monthlyPrice === undefined;
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.images[0]} alt="" className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{product.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {CATEGORIES.find((c) => c.id === product.category)?.label ?? product.category} · from {formatGBP(card.baseMonthlyPrice)}/mo · {card.contractMonths} months
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.summary}</p>
        {incomplete && (
          <p className="text-xs text-amber-600 mt-1">Pricing is estimated — edit this listing to set your plan prices.</p>
        )}
      </div>
    </div>
  );
}

/** Compact row for the dashboard overview — links through to the Listings page. */
export function ListingRowCompact({ product }: { product: SupplierProduct }) {
  return (
    <Link href={`/supplier/listings?edit=${product.id}`} className="block border border-border rounded-xl p-3 hover:border-emerald-300 hover:bg-accent/40 transition">
      <ListingSummary product={product} />
    </Link>
  );
}

/** Manuals (upload + list) and known issues for one listing, shown in a dialog. */
function ListingSupportDialog({ product, open, onOpenChange }: { product: SupplierProduct; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: docs, mutate } = useSWR<{ documents: DocumentMeta[] }>(open ? `/supplier/products/${product.id}/documents` : null, supplierFetcher);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manuals &amp; known issues</DialogTitle>
          <DialogDescription>{product.name} — ANI uses these to answer buyers&apos; questions about this product.</DialogDescription>
        </DialogHeader>
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Manuals &amp; spec sheets</div>
            <DocumentUpload productId={product.id} onUploaded={() => mutate()} />
          </div>
          <div className="mt-2 space-y-1.5">
            {!docs ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : docs.documents.length === 0 ? (
              <div className="text-xs text-muted-foreground">No manuals uploaded yet.</div>
            ) : (
              docs.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText size={12} /> {d.filename} · {formatFileSize(d.sizeBytes)}
                  {!d.hasExtractedText && <span className="text-amber-600">(no extractable text)</span>}
                </div>
              ))
            )}
          </div>
          <ProductKnowledgeBase productId={product.id} basePath="/supplier/products" client={supplierApi} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A listing on the supplier's Listings page — the exact marketplace card
 * buyers see (a non-clickable preview here), with the supplier's actions
 * underneath: edit, view live, and manuals/known issues.
 */
export function ListingCard({ product, supplierName, onEdit }: { product: SupplierProduct; supplierName?: string; onEdit: () => void }) {
  const [supportOpen, setSupportOpen] = useState(false);
  const card = mapSupplierProduct({ ...product, vendorName: supplierName });
  const incomplete = product.listing?.monthlyPrice === undefined;

  return (
    <div className="flex flex-col">
      {/* inert: the card's own link and save button are buyer actions */}
      <div inert className="pointer-events-none flex-1 flex [&>a]:flex-1">
        <ProductCard product={card} contractType="personal" isSaved={false} onToggleSave={() => {}} />
      </div>
      {incomplete && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Pricing is estimated — edit to set your plan prices.
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={onEdit} className="flex-1 gap-1.5"><Pencil size={14} /> Edit listing</Button>
        <Button size="sm" variant="outline" asChild className="gap-1.5">
          <Link href={`/marketplace/${product.id}`} target="_blank"><ExternalLink size={14} /> View</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label="More options" className="px-2"><MoreHorizontal size={16} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onEdit}><Pencil size={14} className="mr-2" /> Edit listing</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/marketplace/${product.id}`} target="_blank"><ExternalLink size={14} className="mr-2" /> View on marketplace</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSupportOpen(true)}><BookOpen size={14} className="mr-2" /> Manuals &amp; known issues</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ListingSupportDialog product={product} open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
}
