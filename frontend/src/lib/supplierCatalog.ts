"use client";

// Bridges self-registered supplier products (backend `/marketplace/products`)
// into the AutoTrader-style marketplace shape (MpProduct) so they render with
// the exact same card + detail UI as the demo catalogue.

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { getProduct, MP_PRODUCTS, type MpProduct, type MpCategory } from "@/lib/marketplaceMock";
import type { ProductListing } from "@/lib/server/products";

export interface SupplierProduct {
  id: string;
  vendorId: string;
  vendorName?: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  specs?: Record<string, string>;
  priceNote?: string;
  listing?: ProductListing;
  imageIds?: string[];
  createdAt: string;
}

const CAT_MAP: Record<string, MpCategory> = {
  "ev-chargers": "ev-chargers",
  battery: "battery-solutions",
  solar: "solar-solutions",
  "energy-services": "energy-services",
  consulting: "energy-services",
};
const CAT_LABEL: Record<MpCategory, string> = {
  "ev-chargers": "EV Chargers",
  "battery-solutions": "Battery Solutions",
  "solar-solutions": "Solar Solutions",
  "energy-services": "Energy Services",
  "ev-vehicles": "EV Vehicles",
};
const MONTHLY_DEFAULT: Record<MpCategory, number> = {
  "ev-chargers": 15,
  "battery-solutions": 45,
  "solar-solutions": 60,
  "energy-services": 25,
  "ev-vehicles": 199,
};

/** Category stock photos — only used when a supplier hasn't uploaded their own. */
export function stockImagesFor(category: string): string[] {
  const cat = CAT_MAP[category] ?? "energy-services";
  return (MP_PRODUCTS.find((p) => p.category === cat) ?? MP_PRODUCTS[0]).images;
}
function parsePrice(note?: string): number | undefined {
  if (!note) return undefined;
  const m = note.replace(/,/g, "").match(/\d{3,7}/);
  return m ? parseInt(m[0], 10) : undefined;
}

/**
 * Maps a supplier product to the marketplace shape. Every field the supplier
 * filled in on the listing form is used as-is; the estimates below (price
 * parsed from the free-text note, stock photos, generic spec tiles) only
 * apply to listings saved before the structured form existed, or fields
 * left blank. `imageUrls` overrides the gallery — the supplier portal's live
 * preview passes not-yet-uploaded photos this way.
 */
export function mapSupplierProduct(sp: SupplierProduct, imageUrls?: string[]): MpProduct {
  const cat = CAT_MAP[sp.category] ?? "energy-services";
  const l = sp.listing ?? {};
  const uploaded = (sp.imageIds ?? []).map((imgId) => `/api/marketplace/products/${sp.id}/images/${imgId}`);
  const images = imageUrls?.length ? imageUrls : uploaded.length ? uploaded : l.gallery?.length ? l.gallery : stockImagesFor(sp.category);
  const outright = l.outrightPrice ?? parsePrice(sp.priceNote);
  const contractMonths = l.contractMonths ?? 36;
  const monthly = l.monthlyPrice ?? (outright ? Math.max(9, Math.round((outright / contractMonths) * 1.08)) : MONTHLY_DEFAULT[cat]);
  const vendorName = sp.vendorName || "Verified Davwo supplier";
  const brand = l.brand || vendorName;
  const specEntries = sp.specs ? Object.entries(sp.specs).slice(0, 6) : [];
  const specsGrid = l.keySpecs?.length
    ? l.keySpecs
    : specEntries.length
      ? specEntries.map(([label, value]) => ({ label, value: String(value), icon: "check" }))
      : [
          { label: "Category", value: CAT_LABEL[cat], icon: "layers" },
          { label: "Supplier", value: vendorName, icon: "shield" },
          { label: "Availability", value: "On enquiry", icon: "check" },
          { label: "Install", value: "Certified fit", icon: "home" },
        ];
  const features = l.features?.length
    ? l.features
    : sp.description ? sp.description.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 6) : [];
  return {
    id: sp.id,
    category: cat,
    categoryLabel: CAT_LABEL[cat],
    brand,
    model: sp.name,
    version: l.variant || sp.summary,
    photosCount: images.length,
    images,
    baseMonthlyPrice: monthly,
    baseInitialPayment: l.upfrontPayment ?? monthly * 3,
    contractMonths,
    outrightPrice: outright,
    deliveryEstimate: l.installEstimate || sp.priceNote || "Pricing on enquiry",
    deliveryStockNote: l.stockNote || `Supplied & installed by ${vendorName}`,
    specsGrid,
    features,
    detailedSpecs: sp.specs && Object.keys(sp.specs).length ? sp.specs : undefined,
    maintenanceCost: l.maintenanceMonthly ?? 0,
    maintenanceLabel: l.maintenanceLabel || "maintenance plan",
    unitNoun: "units",
    termType: l.termType ?? "finance",
  };
}

/** Live supplier listings mapped into MpProduct[] (empty until suppliers add products). */
export function useSupplierCatalog(): MpProduct[] {
  const { data } = useSWR<{ products: SupplierProduct[] }>("/marketplace/products", fetcher, {
    revalidateOnFocus: false,
  });
  return (data?.products ?? []).map((p) => mapSupplierProduct(p));
}

/** Resolve a product by id — demo catalogue first, then a supplier listing. */
export function useResolvedProduct(id: string): { product: MpProduct | null; loading: boolean } {
  const mock = getProduct(id);
  const { data, isLoading, error } = useSWR<{ product: SupplierProduct; vendor?: { name?: string } }>(
    mock ? null : `/marketplace/products/${id}`,
    fetcher,
  );
  if (mock) return { product: mock, loading: false };
  if (data?.product) return { product: mapSupplierProduct({ ...data.product, vendorName: data.vendor?.name }), loading: false };
  if (error) return { product: null, loading: false };
  return { product: null, loading: isLoading };
}
