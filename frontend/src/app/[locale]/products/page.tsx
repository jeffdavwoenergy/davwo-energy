"use client";

import { MarketplaceCatalogue } from "@/components/marketplace/MarketplaceCatalogue";
import { PublicMarketplaceHeader } from "@/components/marketplace/PublicMarketplaceHeader";

// Public, standalone Davwo Marketplace (linked from the landing page).
export default function PublicMarketplacePage() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
      <PublicMarketplaceHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <MarketplaceCatalogue basePath="/products" />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>© 2026 Davwo Energy Ltd.</span>
          <span>Supplied, installed &amp; monitored by Davwo</span>
        </div>
      </footer>
    </div>
  );
}
