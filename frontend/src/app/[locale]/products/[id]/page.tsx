"use client";

import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { getProduct } from "@/lib/marketplaceMock";
import { ProductDetailView } from "@/components/marketplace/ProductDetailView";
import { PublicMarketplaceHeader } from "@/components/marketplace/PublicMarketplaceHeader";

// Public, standalone product detail (linked from the landing page marketplace).
export default function PublicProductPage() {
  const { id } = useParams<{ id: string }>();
  const product = getProduct(id);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
      <PublicMarketplaceHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {product ? (
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
