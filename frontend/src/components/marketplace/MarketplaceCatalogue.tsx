"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { MarketplaceHero, MarketplaceSupplierCard, MarketplaceLogoCard } from "@/components/marketplace/MarketplaceHero";
import { MarketplaceFilters, type MpFilterState } from "@/components/marketplace/MarketplaceFilters";
import { useSavedProducts } from "@/lib/useSavedProducts";
import { MP_PRODUCTS, CATEGORIES, type MpProduct } from "@/lib/marketplaceMock";
import { useSupplierCatalog } from "@/lib/supplierCatalog";

/** The main grid shows this many results; each device carousel below it shows up to CAROUSEL_LIMIT. */
const GRID_LIMIT = 18;
const CAROUSEL_LIMIT = 6;

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

  // Follows the active filters, so the carousels never show something the filters exclude.
  const deviceRows = useMemo(
    () =>
      CATEGORIES.filter((c) => c.id !== "all")
        .map((c) => ({ id: c.id, label: c.label, products: results.filter((p) => p.category === c.id).slice(0, CAROUSEL_LIMIT) }))
        .filter((row) => row.products.length > 0),
    [results],
  );

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
          {results.slice(0, GRID_LIMIT).map((p) => (
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

      {/* One carousel per device type, under the grid */}
      {deviceRows.length > 0 && (
        <div className="mt-14 space-y-12" data-testid="marketplace-device-carousels">
          {deviceRows.map((row) => (
            <DeviceCarousel key={row.id} title={row.label} products={row.products}>
              {(p) => (
                <ProductCard
                  product={p}
                  basePath={basePath}
                  contractType={filters.contractType}
                  isSaved={isSaved(p.id)}
                  onToggleSave={(e, id) => {
                    e.preventDefault();
                    toggle(id);
                  }}
                />
              )}
            </DeviceCarousel>
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

/** Thumb geometry as fractions of the track: width = visible share of the
 * row, left = how far along it's scrolled. */
interface BarState { overflow: boolean; size: number; left: number }

/** Horizontal, swipeable row of product cards — sized to match the grid
 * above (1 / 2 / 3 / 4 across). Mobile keeps prev/next arrows; from sm up a
 * slim, light scrollbar under the row shows position and can be dragged or
 * clicked. Both only appear when the row has more cards than fit. */
function DeviceCarousel({ title, products, children }: { title: string; products: MpProduct[]; children: (p: MpProduct) => React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  const [bar, setBar] = useState<BarState>({ overflow: false, size: 1, left: 0 });
  const scroll = (dir: 1 | -1) => trackRef.current?.scrollBy({ left: dir * trackRef.current.clientWidth, behavior: "smooth" });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const size = el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1;
      setBar({ overflow: max > 1, size, left: max > 0 ? (el.scrollLeft / max) * (1 - size) : 0 });
    };
    // ResizeObserver reports once on observe, so this also measures initially.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [products.length]);

  const onThumbDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, scroll: el.scrollLeft };
    el.style.scrollSnapType = "none"; // snapping fights a dragged position
  };
  const onThumbMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const barEl = barRef.current;
    if (!drag.current || !el || !barEl) return;
    const travel = barEl.clientWidth * (1 - bar.size);
    if (travel <= 0) return;
    el.scrollLeft = drag.current.scroll + ((e.clientX - drag.current.x) / travel) * (el.scrollWidth - el.clientWidth);
  };
  const onThumbUp = () => {
    drag.current = null;
    if (trackRef.current) trackRef.current.style.scrollSnapType = "";
  };
  /** Clicking the bar (not the thumb) jumps there. */
  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const barEl = barRef.current;
    if (!el || !barEl) return;
    const rect = barEl.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width - bar.size / 2) / (1 - bar.size || 1));
    el.scrollTo({ left: frac * (el.scrollWidth - el.clientWidth), behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-[#0c132b]">{title}</h2>
        {bar.overflow && (
          <div className="flex items-center gap-2 sm:hidden">
            <button
              onClick={() => scroll(-1)}
              aria-label={`Previous ${title}`}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll(1)}
              aria-label={`Next ${title}`}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={trackRef}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <div
            key={p.id}
            className="snap-start shrink-0 w-[85%] sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)] xl:w-[calc((100%-3.75rem)/4)]"
          >
            {children(p)}
          </div>
        ))}
      </div>
      {bar.overflow && (
        <div
          ref={barRef}
          onClick={onBarClick}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((bar.left / (1 - bar.size || 1)) * 100)}
          aria-label={`Scroll ${title}`}
          className="hidden sm:block relative mt-3 h-1.5 rounded-full bg-slate-200/50 cursor-pointer"
        >
          <div
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 rounded-full bg-slate-400/40 hover:bg-slate-400/60 active:bg-slate-500/60 transition-colors cursor-grab active:cursor-grabbing touch-none"
            style={{ width: `${bar.size * 100}%`, left: `${bar.left * 100}%` }}
          />
        </div>
      )}
    </section>
  );
}
