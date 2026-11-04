"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import superAdminApi, { useOverview, apiError, formatDate, CATEGORY_LABEL, type OverviewProduct } from "@/lib/superAdminApi";
import { stockImagesFor } from "@/lib/supplierCatalog";
import { formatGBP } from "@/lib/format";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { ConfirmAction, FilterSelect, SearchBox } from "@/components/superadmin/parts";

function ListingCard({ product }: { product: OverviewProduct }) {
  const { mutate } = useOverview();
  const image = product.imageUrl ?? stockImagesFor(product.category)[0];

  const remove = async () => {
    try {
      await superAdminApi.delete(`/superadmin/products/${product.id}`);
      toast.success(`"${product.name}" removed from the marketplace.`);
      await mutate();
    } catch (err) {
      toast.error(apiError(err, "Could not remove the listing."));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
      <div className="aspect-[16/10] bg-muted relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />}
        <span className="absolute top-3 left-3 text-[11px] font-semibold bg-white/90 text-slate-800 rounded-full px-2.5 py-1">
          {CATEGORY_LABEL[product.category] ?? product.category}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground truncate">{product.vendorName}{product.brand && product.brand !== product.vendorName ? ` · ${product.brand}` : ""}</div>
        <div className="font-display font-semibold text-base mt-0.5 truncate">{product.name}</div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">{product.summary}</p>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">
            {product.monthlyPrice != null ? <>{formatGBP(product.monthlyPrice)}<span className="text-xs font-normal text-muted-foreground">/month</span></>
              : product.outrightPrice != null ? formatGBP(product.outrightPrice) : <span className="text-muted-foreground font-normal">No price set</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">Listed {formatDate(product.createdAt)}</div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
          <a
            href={`/marketplace/${product.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            View live listing <ExternalLink size={12} />
          </a>
          <ConfirmAction
            trigger={
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 size={14} /> Remove
              </Button>
            }
            title={`Remove "${product.name}"?`}
            description={<>This takes the listing off the marketplace for everyone, including its photos and documents. {product.vendorName} can publish it again from their Supplier Portal.</>}
            confirmLabel="Remove listing"
            onConfirm={remove}
          />
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminMarketplacePage() {
  const { data, error } = useOverview();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [vendor, setVendor] = useState("all");

  const vendors = useMemo(
    () => [...new Map((data?.products ?? []).map((p) => [p.vendorId, p.vendorName])).entries()].map(([value, label]) => ({ value, label })),
    [data],
  );
  const products = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.products ?? []).filter((p) =>
      (category === "all" || p.category === category) &&
      (vendor === "all" || p.vendorId === vendor) &&
      (!needle || [p.name, p.summary, p.vendorName, p.brand].some((f) => f?.toLowerCase().includes(needle))),
    );
  }, [data, q, category, vendor]);

  if (error) return <ErrorBox message="Could not load listings." />;

  return (
    <div>
      <PageHeader
        title="Marketplace listings"
        subtitle="Everything suppliers have published on the Davwo Marketplace. Review listings and take down anything that shouldn't be live."
        status={data ? [{ label: "Live listings", value: data.stats.listings }, { label: "Suppliers", value: vendors.length }] : []}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search listings" />
        <FilterSelect
          value={category}
          onChange={setCategory}
          allLabel="All categories"
          options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect value={vendor} onChange={setVendor} allLabel="All suppliers" options={vendors} className="sm:w-56" />
      </div>

      {!data ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>
      ) : products.length === 0 ? <Panel><EmptyBox message="No listings match." /></Panel> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {products.map((p) => <ListingCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
