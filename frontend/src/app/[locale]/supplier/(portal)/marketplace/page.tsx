"use client";

import { MarketplaceCatalogue } from "@/components/marketplace/MarketplaceCatalogue";

/** The marketplace as buyers see it, inside the Supplier Portal shell. */
export default function SupplierMarketplacePage() {
  return <MarketplaceCatalogue basePath="/supplier/marketplace" showHero={false} />;
}
