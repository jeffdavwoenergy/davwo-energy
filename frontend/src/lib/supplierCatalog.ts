"use client";

// Bridges self-registered supplier products (backend `/marketplace/products`)
// into the AutoTrader-style marketplace shape (MpProduct) so they render with
// the exact same card + detail UI as the demo catalogue.

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { getProduct, MP_PRODUCTS, type MpProduct, type MpCategory } from "@/lib/marketplaceMock";

interface SupplierProduct {
  id: string;
  vendorId: string;
  vendorName?: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  specs?: Record<string, string>;
  priceNote?: string;
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

function imagesFor(cat: MpCategory) {
  const rep = MP_PRODUCTS.find((p) => p.category === cat) ?? MP_PRODUCTS[0];
  return { images: rep.images, photosCount: rep.photosCount };
}
function parsePrice(note?: string): number | undefined {
  if (!note) return undefined;
  const m = note.replace(/,/g, "").match(/\d{3,7}/);
  return m ? parseInt(m[0], 10) : undefined;
}

export function mapSupplierProduct(sp: SupplierProduct): MpProduct {
  const cat = CAT_MAP[sp.category] ?? "energy-services";
  const { images, photosCount } = imagesFor(cat);
  const outright = parsePrice(sp.priceNote);
  const monthly = outright ? Math.max(9, Math.round((outright / 36) * 1.08)) : MONTHLY_DEFAULT[cat];
  const vendorName = sp.vendorName || "Verified Davwo supplier";
  const specEntries = sp.specs ? Object.entries(sp.specs).slice(0, 6) : [];
  const specsGrid = specEntries.length
    ? specEntries.map(([label, value]) => ({ label, value: String(value), icon: "check" }))
    : [
        { label: "Category", value: CAT_LABEL[cat], icon: "layers" },
        { label: "Supplier", value: vendorName, icon: "shield" },
        { label: "Availability", value: "On enquiry", icon: "check" },
        { label: "Install", value: "Certified fit", icon: "home" },
      ];
  return {
    id: sp.id,
    category: cat,
    categoryLabel: CAT_LABEL[cat],
    brand: vendorName,
    model: sp.name,
    version: sp.summary,
    photosCount,
    images,
    baseMonthlyPrice: monthly,
    baseInitialPayment: monthly * 3,
    contractMonths: 36,
    outrightPrice: outright,
    deliveryEstimate: sp.priceNote || "Pricing on enquiry",
    deliveryStockNote: `Supplied & installed by ${vendorName}`,
    specsGrid,
    features: sp.description ? sp.description.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 6) : [],
    detailedSpecs: sp.specs,
    maintenanceCost: 0,
    maintenanceLabel: "maintenance plan",
    unitNoun: "units",
    termType: "finance",
  };
}

/** Live supplier listings mapped into MpProduct[] (empty until suppliers add products). */
export function useSupplierCatalog(): MpProduct[] {
  const { data } = useSWR<{ products: SupplierProduct[] }>("/marketplace/products", fetcher, {
    revalidateOnFocus: false,
  });
  return (data?.products ?? []).map(mapSupplierProduct);
}

/** Resolve a product by id — demo catalogue first, then a supplier listing. */
export function useResolvedProduct(id: string): { product: MpProduct | null; loading: boolean } {
  const mock = getProduct(id);
  const { data, isLoading, error } = useSWR<{ product: SupplierProduct }>(mock ? null : `/marketplace/products/${id}`, fetcher);
  if (mock) return { product: mock, loading: false };
  if (data?.product) return { product: mapSupplierProduct(data.product), loading: false };
  if (error) return { product: null, loading: false };
  return { product: null, loading: isLoading };
}
