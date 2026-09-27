"use client";

import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { getProduct } from "@/lib/marketplaceMock";
import { ProductDetailView } from "@/components/marketplace/ProductDetailView";

export default function MarketplaceProductPage() {
  const { id } = useParams<{ id: string }>();
  const product = getProduct(id);

  if (!product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <p>Product not found.</p>
        <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
          <ArrowLeft size={15} /> Back to marketplace
        </Link>
      </div>
    );
  }

  return <ProductDetailView product={product} />;
}
