"use client";

import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useResolvedProduct } from "@/lib/supplierCatalog";
import { ProductDetailView } from "@/components/marketplace/ProductDetailView";
import { PublicMarketplaceHeader } from "@/components/marketplace/PublicMarketplaceHeader";

// Public, standalone product detail (linked from the landing page marketplace).
export default function PublicProductPage() {
  const { id } = useParams<{ id: string }>();
  const { product, loading } = useResolvedProduct(id);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
      <PublicMarketplaceHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : product ? (
          <ProductDetailView product={product} basePath="/products" />
        ) : (
          <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-500">
            <p>Product not found.</p>
            <Link href="/products" className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <ArrowLeft size={15} /> Back to marketplace
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
