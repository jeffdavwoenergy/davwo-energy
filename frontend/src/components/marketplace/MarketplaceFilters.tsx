"use client";

import { Search, X, ChevronDown, RotateCcw } from "lucide-react";
import { SpecIcon } from "./SpecIcon";
import { CATEGORIES, type MpCategory } from "@/lib/marketplaceMock";

export interface MpFilterState {
  category: MpCategory | "all";
  searchQuery: string;
  brand: string;
  maxPrice: string;
  contractType: "personal" | "business";
  sortBy: "relevance" | "price-asc" | "price-desc";
}

interface Props {
  filters: MpFilterState;
  onChange: <K extends keyof MpFilterState>(key: K, value: MpFilterState[K]) => void;
  onReset: () => void;
  availableBrands: string[];
  totalResults: number;
  categoryCounts: Record<string, number>;
}

export function MarketplaceFilters({ filters, onChange, onReset, availableBrands, totalResults, categoryCounts }: Props) {
  const isFiltered = Boolean(filters.searchQuery || filters.brand || filters.category !== "all" || filters.maxPrice);

  return (
    <div className="w-full mb-6 space-y-4">
      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = filters.category === cat.id;
          const count = categoryCounts[cat.id] || 0;
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`filter-category-${cat.id}`}
              onClick={() => onChange("category", cat.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-sm"
              }`}
            >
              <SpecIcon icon={cat.icon} className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-600"}`} />
              <span>{cat.label}</span>
              <span
                className={`text-[11px] font-semibold px-1.5 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + selects */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="marketplace-search-input"
              value={filters.searchQuery}
              onChange={(e) => onChange("searchQuery", e.target.value)}
              placeholder="Search by brand, product, capacity, or feature..."
              className="w-full bg-[#f8f9fa] border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-sm"
            />
            {filters.searchQuery && (
              <button
                type="button"
                onClick={() => onChange("searchQuery", "")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="lg:col-span-3 relative">
            <select
              value={filters.brand}
              data-testid="filter-brand"
              onChange={(e) => onChange("brand", e.target.value)}
              className="w-full appearance-none bg-[#f8f9fa] hover:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-slate-800 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-sm transition-colors"
            >
              <option value="">All brands &amp; providers</option>
              {availableBrands.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="lg:col-span-3 relative">
            <select
              value={filters.sortBy}
              data-testid="filter-sort"
              onChange={(e) => onChange("sortBy", e.target.value as MpFilterState["sortBy"])}
              className="w-full appearance-none bg-[#f8f9fa] hover:bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-slate-900 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-sm transition-colors"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              data-testid="filter-personal"
              onClick={() => onChange("contractType", "personal")}
              className={`px-4 py-1.5 rounded-md font-bold text-[12px] transition-all cursor-pointer ${
                filters.contractType === "personal" ? "bg-white text-[#0c132b] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Personal (inc. VAT)
            </button>
            <button
              type="button"
              data-testid="filter-business"
              onClick={() => onChange("contractType", "business")}
              className={`px-4 py-1.5 rounded-md font-bold text-[12px] transition-all cursor-pointer ${
                filters.contractType === "business" ? "bg-white text-[#0c132b] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Business (ex. VAT)
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-medium">
              Showing <strong className="text-slate-900 font-bold">{totalResults}</strong> items
            </span>
            {isFiltered && (
              <button
                type="button"
                data-testid="filter-reset"
                onClick={onReset}
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
