"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, PackagePlus, X } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, EmptyBox } from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { ProductListingForm } from "@/components/supplier/ProductListingForm";
import { ListingCard } from "@/components/supplier/ListingRow";
import { useSupplierAccount, useSupplierProducts } from "@/lib/supplierPortal";
import type { SupplierProduct } from "@/lib/supplierCatalog";

function ListingsInner() {
  const params = useSearchParams();
  const { data: supplier } = useSupplierAccount();
  const { products, mutate } = useSupplierProducts();

  // Form state: closed, adding a new product, or editing one. ?new=1 and
  // ?edit=<id> (from the dashboard) open it on arrival.
  const [mode, setMode] = useState<"closed" | "new" | "edit">(params.get("new") ? "new" : params.get("edit") ? "edit" : "closed");
  const [editingId, setEditingId] = useState<string | null>(params.get("edit"));
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  const editing = mode === "edit" ? products?.find((p) => p.id === editingId) : undefined;

  const open = (next: "new" | SupplierProduct) => {
    if (next === "new") { setMode("new"); setEditingId(null); }
    else { setMode("edit"); setEditingId(next.id); }
    setFormKey((k) => k + 1);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const close = () => { setMode("closed"); setEditingId(null); };

  return (
    <div>
      <PageHeader
        title="Listings"
        subtitle="Everything buyers see on your marketplace listings — photos, plan pricing, specs and installation."
        right={mode === "closed" && (
          <Button onClick={() => open("new")} className="gap-1.5"><Plus size={15} /> Add a product</Button>
        )}
      />

      {(mode === "new" || (mode === "edit" && editing)) && (
        <div ref={formRef} className="scroll-mt-6 mb-6">
          <Panel
            title={editing ? `Edit listing: ${editing.name}` : "Add a product"}
            right={<Button variant="ghost" size="icon" aria-label="Close" onClick={close}><X size={16} /></Button>}
          >
            <ProductListingForm
              key={formKey}
              supplierName={supplier?.companyName ?? ""}
              initial={editing}
              onSaved={async () => { close(); await mutate(); }}
              onCancel={close}
            />
          </Panel>
        </div>
      )}

      <Panel title="Your listings" subtitle={products ? `${products.length} on the marketplace` : undefined}>
        {!products ? (
          <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : products.length === 0 ? (
          <div className="text-center">
            <EmptyBox message="No listings yet." />
            {mode === "closed" && (
              <Button onClick={() => open("new")} variant="outline" className="gap-1.5 -mt-4 mb-4"><PackagePlus size={15} /> Add your first product</Button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map((p) => <ListingCard key={p.id} product={p} supplierName={supplier?.companyName} onEdit={() => open(p)} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function SupplierListingsPage() {
  return (
    <Suspense>
      <ListingsInner />
    </Suspense>
  );
}
