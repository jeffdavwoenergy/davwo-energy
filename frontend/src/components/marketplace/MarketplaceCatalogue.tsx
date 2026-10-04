"use client";

import { useMemo, useRef, useState } from "react";
import { Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { MarketplaceHero, MarketplaceSupplierCard, MarketplaceLogoCard } from "@/components/marketplace/MarketplaceHero";
import { MarketplaceFilters, type MpFilterState } from "@/components/marketplace/MarketplaceFilters";
import { useSavedProducts } from "@/lib/useSavedProducts";
import { MP_PRODUCTS, CATEGORIES } from "@/lib/marketplaceMock";
import { useSupplierCatalog } from "@/lib/supplierCatalog";

const INITIAL: MpFilterState = {
  category: "all",
  searchQuery: "",
  brand: "",
  maxPrice: "",
  contractType: "personal",
  sortBy: "relevance",
};

/** showHero: the public marketplace opens with the hero + supplier/logo cards;
 * signed-in ANI™ and Supplier Portal users go straight to the catalogue. */
export function MarketplaceCatalogue({ basePath = "/marketplace", showHero = true }: { basePath?: string; showHero?: boolean }) {
  const { isSaved, toggle } = useSavedProducts();
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<MpFilterState>(INITIAL);
  const supplierProducts = useSupplierCatalog();
  const ALL = useMemo(() => [...supplierProducts, ...MP_PRODUCTS], [supplierProducts]);

  const onChange = <K extends keyof MpFilterState>(key: K, value: MpFilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value, ...(key === "category" ? { brand: "" } : {}) }));

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: ALL.length };
    for (const c of CATEGORIES) if (c.id !== "all") counts[c.id] = 0;
    for (const p of ALL) counts[p.category] = (counts[p.category] || 0) + 1;
    return counts;
  }, [ALL]);

  const availableBrands = useMemo(() => {
    const pool = filters.category === "all" ? ALL : ALL.filter((p) => p.category === filters.category);
    return Array.from(new Set(pool.map((p) => p.brand))).sort();
  }, [filters.category, ALL]);

  const results = useMemo(() => {
    let list = [...ALL];
    if (filters.category !== "all") list = list.filter((p) => p.category === filters.category);
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.brand.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q) ||
          p.version.toLowerCase().includes(q) ||
          p.categoryLabel.toLowerCase().includes(q) ||
          p.deliveryStockNote.toLowerCase().includes(q) ||
          p.specsGrid.some((s) => s.value.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)) ||
          p.features.some((f) => f.toLowerCase().includes(q)),
      );
    }
    if (filters.brand) list = list.filter((p) => p.brand === filters.brand);
    if (filters.sortBy === "price-asc") list.sort((a, b) => a.baseMonthlyPrice - b.baseMonthlyPrice);
    else if (filters.sortBy === "price-desc") list.sort((a, b) => b.baseMonthlyPrice - a.baseMonthlyPrice);
    return list;
  }, [filters, ALL]);

  return (
    <div data-testid="marketplace-catalog">
      {showHero && (
        <>
          <MarketplaceHero onBrowse={() => filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          <div className="grid grid-cols-[7fr_3fr] gap-3 sm:gap-4 mb-6">
            <MarketplaceSupplierCard />
            <MarketplaceLogoCard />
          </div>
        </>
      )}

      <div ref={filtersRef} className="scroll-mt-20">
        <MarketplaceFilters
          filters={filters}
          onChange={onChange}
          onReset={() => setFilters(INITIAL)}
          availableBrands={availableBrands}
          totalResults={results.length}
          categoryCounts={categoryCounts}
        />
      </div>

      {/* Results header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-slate-200 mb-6 text-xs sm:text-sm">
        <span className="font-bold text-[#0c132b] text-sm" data-testid="results-count">
          {results.length} results
        </span>
        <div className="text-slate-600">
          Showing the <strong className="text-slate-900 font-bold">cheapest monthly price</strong> for each product. Open any item to
          personalise your terms.
        </div>
      </div>

      {/* Grid */}
      {results.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-xl border border-slate-200">
          <p className="text-lg font-bold text-slate-800 mb-1">No products matched your criteria</p>
          <p className="text-sm text-slate-500">Try widening your filters or resetting options</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {results.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              basePath={basePath}
              contractType={filters.contractType}
              isSaved={isSaved(p.id)}
              onToggleSave={(e, id) => {
                e.preventDefault();
                toggle(id);
              }}
            />
          ))}
        </div>
      )}

      {/* Help */}
      <div className="mt-16 pt-12 border-t border-slate-200 text-center max-w-2xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-[#0c132b] mb-2">Need help or have a question?</h2>
        <p className="text-sm text-slate-600 mb-6">Our energy specialists are available to help with any questions about your options.</p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm">
          <a href="tel:08006888800" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition-colors">
            <Phone className="w-4 h-4 text-slate-700" />
            <span>0800 688 8800</span>
          </a>
          <button
            onClick={() => toast("Our advisors are available Mon–Fri, 9am–6pm", { description: "Open any product and tap ‘Contact us’ to request a callback." })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-slate-700" />
            <span>Chat with an advisor</span>
          </button>
        </div>
      </div>
    </div>
  );
}
