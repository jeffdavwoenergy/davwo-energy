"use client";

import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { useSavedProducts } from "@/lib/useSavedProducts";
import { MP_PRODUCTS } from "@/lib/marketplaceMock";

// Popular listings: REAL marketplace products rendered with the existing marketplace ProductCard.
export function PopularListings({ onSeeMore }: { onSeeMore: () => void }) {
  const { isSaved, toggle } = useSavedProducts();
  const products = MP_PRODUCTS.slice(0, 4);

  return (
    <section className="w-full py-12 md:py-16 bg-white border-b border-neutral-100">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">Popular Marketplace Listings</h2>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">
              Top verified turnkey clean energy solutions matched by the DAVWO AI network.
            </p>
          </div>
          <button
            onClick={onSeeMore}
            data-testid="popular-see-more"
            className="group flex items-center gap-1 text-sm font-semibold text-neutral-800 hover:text-emerald-700 transition cursor-pointer shrink-0"
          >
            <span>See More</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              basePath="/marketplace"
              contractType="personal"
              isSaved={isSaved(p.id)}
              onToggleSave={(e, id) => {
                e.preventDefault();
                toggle(id);
              }}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/marketplace"
            data-testid="popular-browse-all"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#125638] hover:bg-[#0c3e27] text-white font-semibold px-6 py-3 text-sm transition-colors"
          >
            Browse the full marketplace <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
