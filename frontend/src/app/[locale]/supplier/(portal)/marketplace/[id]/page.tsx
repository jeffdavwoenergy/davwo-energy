"use client";

import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useResolvedProduct } from "@/lib/supplierCatalog";
import { ProductDetailView } from "@/components/marketplace/ProductDetailView";

export default function SupplierMarketplaceProductPage() {
  const { id } = useParams<{ id: string }>();
  const { product, loading } = useResolvedProduct(id);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <p>Product not found.</p>
        <Link href="/supplier/marketplace" className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
          <ArrowLeft size={15} /> Back to marketplace
        </Link>
      </div>
    );
  }

  return <ProductDetailView product={product} basePath="/supplier/marketplace" />;
}
