import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";

/**
 * The real product catalogue behind the marketplace — distinct from the
 * static curated VENDORS list in marketplace.ts. A product belongs to a
 * vendor (by id, matched loosely against marketplace.ts's static vendors —
 * there's no real supplier-account system yet, so products are added by
 * platform admins on a vendor's behalf; see PHASE2_BUILD_PLAN.md Stage 4 for
 * the still-deferred supplier self-service flow). Same Postgres-with-
 * in-memory-fallback pattern as every other store in this codebase.
 */
export interface ProductRecord {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  specs?: Record<string, string>;
  priceNote?: string;
  /** Structured fields the marketplace card, detail page and plan builder
   * render — absent on products listed before the listing form existed. */
  listing?: ProductListing;
  /** Uploaded listing photos, gallery order (first = card hero image). */
  imageIds?: string[];
  createdAt: string;
}

export const TERM_TYPES = ["finance", "lease", "subscription"] as const;
export type TermType = (typeof TERM_TYPES)[number];
/** The contract lengths the plan builder offers — a supplier's default term must be one of them. */
export const CONTRACT_TERMS = [24, 36, 48, 60] as const;
/** Icon keys SpecIcon renders for a key-spec tile. */
export const SPEC_ICONS = ["zap", "plug", "battery", "sun", "activity", "gauge", "shield", "check", "home", "layers"] as const;
export const MAX_KEY_SPECS = 6;
export const MAX_FEATURES = 8;

export interface ListingSpec {
  label: string;
  value: string;
  icon: string;
}

export interface ProductListing {
  brand?: string;
  /** Card/detail subtitle, e.g. "7.4kW smart home charger" (falls back to summary). */
  variant?: string;
  /** Advertised "from £X/month" (inc. VAT) at the default term. */
  monthlyPrice?: number;
  /** Upfront payment (inc. VAT) at the default term — 0 shows "£0 deposit option". */
  upfrontPayment?: number;
  contractMonths?: number;
  termType?: TermType;
  outrightPrice?: number;
  /** Optional add-on the buyer can tick in the plan builder. */
  maintenanceMonthly?: number;
  maintenanceLabel?: string;
  keySpecs?: ListingSpec[];
  features?: string[];
  installEstimate?: string;
  stockNote?: string;
  /** Platform-provided photo URLs (the seeded demo listings use the
   * marketplace's stock photography). Never accepted from the supplier API
   * — parseListing drops it — and kept across supplier edits. */
  gallery?: string[];
}

function cleanText(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || undefined;
}

function cleanMoney(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 10_000_000) * 100) / 100 : undefined;
}

/** Validates/clamps an untrusted listing payload from the supplier or admin
 * form — unknown keys dropped, bad values omitted rather than rejected, so
 * a half-filled form still saves (the marketplace falls back per field). */
export function parseListing(raw: unknown): ProductListing | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const months = Number(r.contractMonths);
  const keySpecs = (Array.isArray(r.keySpecs) ? r.keySpecs : [])
    .map((s) => {
      const spec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const label = cleanText(spec.label, 40);
      const value = cleanText(spec.value, 60);
      const icon = SPEC_ICONS.includes(spec.icon as (typeof SPEC_ICONS)[number]) ? (spec.icon as string) : "check";
      return label && value ? { label, value, icon } : undefined;
    })
    .filter((s): s is ListingSpec => Boolean(s))
    .slice(0, MAX_KEY_SPECS);
  const features = (Array.isArray(r.features) ? r.features : [])
    .map((f) => cleanText(f, 160))
    .filter((f): f is string => Boolean(f))
    .slice(0, MAX_FEATURES);

  const listing: ProductListing = {
    brand: cleanText(r.brand, 80),
    variant: cleanText(r.variant, 120),
    monthlyPrice: cleanMoney(r.monthlyPrice),
    upfrontPayment: cleanMoney(r.upfrontPayment),
    contractMonths: CONTRACT_TERMS.includes(months as (typeof CONTRACT_TERMS)[number]) ? months : undefined,
    termType: TERM_TYPES.includes(r.termType as TermType) ? (r.termType as TermType) : undefined,
    outrightPrice: cleanMoney(r.outrightPrice),
    maintenanceMonthly: cleanMoney(r.maintenanceMonthly),
    maintenanceLabel: cleanText(r.maintenanceLabel, 60),
    keySpecs: keySpecs.length ? keySpecs : undefined,
    features: features.length ? features : undefined,
    installEstimate: cleanText(r.installEstimate, 80),
    stockNote: cleanText(r.stockNote, 160),
  };
  const defined = Object.fromEntries(Object.entries(listing).filter(([, v]) => v !== undefined));
  return Object.keys(defined).length ? (defined as ProductListing) : undefined;
}

export interface ProductDocumentMeta {
  id: string;
  productId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  hasExtractedText: boolean;
}

interface StoredDocument {
  meta: ProductDocumentMeta;
  data: Buffer;
  extractedText?: string;
}

interface StoredImage {
  id: string;
  productId: string;
  mimeType: string;
  data: Buffer;
  position: number;
}

const memoryProducts = new Map<string, ProductRecord>();
const memoryDocuments = new Map<string, StoredDocument>(); // key: document id
const memoryImages = new Map<string, StoredImage>(); // key: image id

/** Gallery-ordered image ids for an in-memory product. */
function memoryImageIds(productId: string): string[] {
  return [...memoryImages.values()]
    .filter((i) => i.productId === productId)
    .sort((a, b) => a.position - b.position)
    .map((i) => i.id);
}

function withMemoryImages(p: ProductRecord): ProductRecord {
  return { ...p, imageIds: memoryImageIds(p.id) };
}

/** Prisma include for a product's image ids — ids only, never the blobs. */
const IMAGE_IDS = { images: { select: { id: true }, orderBy: { position: "asc" } } } as const;

const MP = "/marketplace";

/** Built-in listings for the two demo suppliers (suppliers.ts DEMO_SUPPLIERS),
 * so both demo companies have a populated catalogue out of the box. */
export const DEMO_PRODUCTS: Omit<ProductRecord, "imageIds">[] = [
  {
    id: "demo-davwo-gridsaver-13", vendorId: "s-davwo", createdAt: "2026-09-01T09:00:00.000Z",
    name: "GridSaver 13.5", category: "battery",
    summary: "13.5kWh whole-home battery with backup power",
    description: "Store cheap overnight and solar energy and use it when prices peak. Whole-home backup keeps the lights on in a power cut. ANI™ schedules charging around live UK grid prices and carbon intensity.",
    specs: { Chemistry: "LFP (lithium iron phosphate)", "Round-trip efficiency": "90%", "Continuous power": "5 kW", "Peak power": "10 kW", "IP rating": "IP67", Dimensions: "1150 × 753 × 147 mm" },
    listing: {
      brand: "Davwo", variant: "13.5kWh whole-home battery", monthlyPrice: 69, upfrontPayment: 0, contractMonths: 60, termType: "finance",
      outrightPrice: 7950, maintenanceMonthly: 8, maintenanceLabel: "monitoring & battery health checks",
      keySpecs: [
        { label: "Capacity", value: "13.5 kWh", icon: "battery" }, { label: "Power", value: "5 kW continuous", icon: "zap" },
        { label: "Backup", value: "Whole-home", icon: "home" }, { label: "Warranty", value: "10 years", icon: "shield" },
        { label: "App", value: "Davwo app", icon: "activity" }, { label: "Install", value: "MCS certified", icon: "check" },
      ],
      features: ["Whole-home backup during power cuts", "Smart charging from cheap overnight tariffs", "Stores surplus solar for the evening", "10-year manufacturer warranty"],
      installEstimate: "Installed in 2–3 weeks", stockNote: "In stock — free survey & installation included",
      gallery: [`${MP}/home_battery_storage_1790445600187.jpg`, `${MP}/home_battery_pack_1790445951882.jpg`, `${MP}/energy_service_hub_1790445623303.jpg`],
    },
  },
  {
    id: "demo-davwo-sunroof-6", vendorId: "s-davwo", createdAt: "2026-09-02T09:00:00.000Z",
    name: "SunRoof 6kW", category: "solar",
    summary: "6kW rooftop solar package for homes and small businesses",
    description: "Fifteen high-efficiency panels with a hybrid inverter, ready to pair with a battery. Typical UK output is around 5,700 kWh a year. Includes scaffolding, installation and grid registration.",
    specs: { Panels: "15 × 400W monocrystalline", Inverter: "6kW hybrid", "Estimated yield": "≈5,700 kWh / year", "Panel warranty": "25 years", "Grid registration": "Included (G98/G99)" },
    listing: {
      brand: "Davwo", variant: "6kW rooftop solar package", monthlyPrice: 85, upfrontPayment: 0, contractMonths: 60, termType: "finance",
      outrightPrice: 9450, maintenanceMonthly: 6, maintenanceLabel: "panel cleaning & performance monitoring",
      keySpecs: [
        { label: "System", value: "6 kW", icon: "sun" }, { label: "Panels", value: "15 × 400W", icon: "layers" },
        { label: "Yield", value: "≈5,700 kWh/yr", icon: "gauge" }, { label: "Warranty", value: "25 years", icon: "shield" },
        { label: "Battery ready", value: "Hybrid inverter", icon: "battery" }, { label: "Install", value: "MCS certified", icon: "check" },
      ],
      features: ["Battery-ready hybrid inverter", "Scaffolding, install and grid registration included", "Live generation tracking in the Davwo app", "25-year panel performance warranty"],
      installEstimate: "Installed in 3–4 weeks", stockNote: "In stock — roof survey included",
      gallery: [`${MP}/rooftop_solar_panel_1790445967461.jpg`, `${MP}/solar_panel_array_1790445612561.jpg`, `${MP}/smart_energy_meter_1790445982795.jpg`],
    },
  },
  {
    id: "demo-davwo-smarthub", vendorId: "s-davwo", createdAt: "2026-09-03T09:00:00.000Z",
    name: "SmartHub Energy Monitor", category: "energy-services",
    summary: "Half-hourly energy monitoring with ANI™ insights",
    description: "Clips onto your meter to track half-hourly usage, cost and carbon. ANI™ spots waste, flags unusual consumption and tells you when to run heavy loads.",
    specs: { Connectivity: "Wi-Fi & 4G", "Data interval": "30 minutes", Compatibility: "SMETS2 smart meters", Reports: "Monthly PDF & CSV" },
    listing: {
      brand: "Davwo", variant: "Smart energy monitoring subscription", monthlyPrice: 9, upfrontPayment: 0, contractMonths: 24, termType: "subscription",
      outrightPrice: 249,
      keySpecs: [
        { label: "Data", value: "Half-hourly", icon: "activity" }, { label: "Connectivity", value: "Wi-Fi & 4G", icon: "zap" },
        { label: "Insights", value: "ANI™ powered", icon: "gauge" }, { label: "Reports", value: "PDF & CSV", icon: "layers" },
      ],
      features: ["Half-hourly cost and carbon tracking", "ANI™ alerts for unusual consumption", "Monthly reports for SECR/ESOS"],
      installEstimate: "Posted in 2–3 days, self-install", stockNote: "In stock — free delivery",
      gallery: [`${MP}/smart_energy_meter_1790445982795.jpg`, `${MP}/energy_service_hub_1790445623303.jpg`],
    },
  },
  {
    id: "demo-acme-fleetcharge-22", vendorId: "s-acme", createdAt: "2026-09-04T09:00:00.000Z",
    name: "FleetCharge 22", category: "ev-chargers",
    summary: "22kW three-phase AC charger for depots and workplaces",
    description: "A rugged three-phase charger built for fleet depots. Load balancing across multiple units, RFID access and OCPP back-office integration.",
    specs: { "Max current": "32 A three-phase", Connector: "Type 2 socket", Protocol: "OCPP 1.6J", Access: "RFID & app", "IP rating": "IP55" },
    listing: {
      brand: "Acme", variant: "22kW three-phase depot charger", monthlyPrice: 42, upfrontPayment: 0, contractMonths: 48, termType: "finance",
      outrightPrice: 1890, maintenanceMonthly: 7, maintenanceLabel: "uptime guarantee & remote support",
      keySpecs: [
        { label: "Power", value: "22 kW AC", icon: "zap" }, { label: "Connector", value: "Type 2", icon: "plug" },
        { label: "Protocol", value: "OCPP 1.6J", icon: "activity" }, { label: "Load balancing", value: "Multi-unit", icon: "gauge" },
        { label: "Warranty", value: "3 years", icon: "shield" }, { label: "Install", value: "OZEV approved", icon: "check" },
      ],
      features: ["Dynamic load balancing across a whole depot", "RFID and app access control", "Works with any OCPP back office", "Weatherproof IP55 enclosure"],
      installEstimate: "Commissioned in 2–4 weeks", stockNote: "In stock — site survey included",
      gallery: [`${MP}/smart_ev_charger_1790445940135.jpg`, `${MP}/ev_charger_wallbox_1790445588036.jpg`],
    },
  },
  {
    id: "demo-acme-rapiddc-60", vendorId: "s-acme", createdAt: "2026-09-05T09:00:00.000Z",
    name: "RapidDC 60", category: "ev-chargers",
    summary: "60kW DC rapid charger for public and fleet sites",
    description: "Dual-connector DC rapid charging that adds around 100 miles in 20 minutes. Contactless payment, live availability and remote diagnostics as standard.",
    specs: { Output: "60 kW DC", Connectors: "CCS2 + CHAdeMO", Payment: "Contactless", Protocol: "OCPP 2.0.1", Footprint: "0.8 m²" },
    listing: {
      brand: "Acme", variant: "60kW DC rapid charger", monthlyPrice: 310, upfrontPayment: 930, contractMonths: 60, termType: "lease",
      outrightPrice: 15900, maintenanceMonthly: 45, maintenanceLabel: "24/7 uptime & parts cover",
      keySpecs: [
        { label: "Power", value: "60 kW DC", icon: "zap" }, { label: "Connectors", value: "CCS2 + CHAdeMO", icon: "plug" },
        { label: "Payment", value: "Contactless", icon: "check" }, { label: "Protocol", value: "OCPP 2.0.1", icon: "activity" },
        { label: "Speed", value: "≈100 miles / 20 min", icon: "gauge" }, { label: "Warranty", value: "5 years", icon: "shield" },
      ],
      features: ["Two vehicles can charge at once", "Contactless card payment built in", "Remote diagnostics and live availability", "Groundworks and DNO application managed for you"],
      installEstimate: "Commissioned in 6–8 weeks", stockNote: "Made to order — groundworks survey included",
      gallery: [`${MP}/smart_ev_charger_1790445940135.jpg`, `${MP}/energy_service_hub_1790445623303.jpg`],
    },
  },
  {
    id: "demo-acme-homecharge-74", vendorId: "s-acme", createdAt: "2026-09-06T09:00:00.000Z",
    name: "HomeCharge 7.4", category: "ev-chargers",
    summary: "7.4kW smart home charger with solar mode",
    description: "A compact tethered home charger with off-peak scheduling and a solar-only mode that charges from your own generation first.",
    specs: { "Max current": "32 A single phase", "Cable length": "5 m tethered", Connectivity: "Wi-Fi & Ethernet", Protocol: "OCPP 1.6J" },
    listing: {
      brand: "Acme", variant: "7.4kW smart home charger", monthlyPrice: 18, upfrontPayment: 0, contractMonths: 36, termType: "finance",
      outrightPrice: 749,
      keySpecs: [
        { label: "Power", value: "7.4 kW", icon: "zap" }, { label: "Cable", value: "5 m tethered", icon: "plug" },
        { label: "Solar mode", value: "Yes", icon: "sun" }, { label: "Warranty", value: "3 years", icon: "shield" },
      ],
      features: ["Solar-only charging mode", "Off-peak scheduling from the app", "Compact, weatherproof design"],
      installEstimate: "Installed in 7–14 days", stockNote: "In stock — standard installation included",
      gallery: [`${MP}/ev_charger_wallbox_1790445588036.jpg`, `${MP}/smart_ev_charger_1790445940135.jpg`],
    },
  },
];

let demoSeeding: Promise<void> | null = null;

/** Lazy, idempotent seed of DEMO_PRODUCTS — in memory always, into Postgres
 * only on a demo deployment (ALLOW_DEMO_LOGIN), same rule as the demo
 * supplier accounts they belong to. */
function ensureDemoProducts(): Promise<void> {
  demoSeeding ??= (async () => {
    if (!isDbConfigured()) {
      for (const p of DEMO_PRODUCTS) if (!memoryProducts.has(p.id)) memoryProducts.set(p.id, { ...p, imageIds: [] });
      return;
    }
    if ((process.env.ALLOW_DEMO_LOGIN ?? "").trim().toLowerCase() !== "true") return;
    const prisma = getPrisma()!;
    for (const p of DEMO_PRODUCTS) {
      if (await prisma.product.findUnique({ where: { id: p.id } })) continue;
      await prisma.product.create({
        data: {
          id: p.id, vendorId: p.vendorId, name: p.name, category: p.category, summary: p.summary,
          description: p.description, specs: p.specs as Prisma.InputJsonValue,
          listing: p.listing as Prisma.InputJsonValue, createdAt: new Date(p.createdAt),
        },
      });
    }
  })().catch((err) => {
    demoSeeding = null;
    throw err;
  });
  return demoSeeding;
}

function matchesQuery(haystack: (string | undefined)[], q: string): boolean {
  const needle = q.toLowerCase();
  return haystack.some((h) => h?.toLowerCase().includes(needle));
}

export async function createProduct(input: Omit<ProductRecord, "id" | "createdAt" | "imageIds">): Promise<ProductRecord> {
  const product: ProductRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input, imageIds: [] };
  if (!isDbConfigured()) {
    memoryProducts.set(product.id, product);
    return product;
  }
  const prisma = getPrisma()!;
  await prisma.product.create({
    data: {
      id: product.id,
      vendorId: product.vendorId,
      name: product.name,
      category: product.category,
      summary: product.summary,
      description: product.description,
      specs: (product.specs ?? undefined) as Prisma.InputJsonValue | undefined,
      priceNote: product.priceNote,
      listing: (product.listing ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: new Date(product.createdAt),
    },
  });
  return product;
}

export type ProductUpdate = Partial<Pick<ProductRecord, "name" | "category" | "summary" | "description" | "specs" | "priceNote" | "listing">>;

/** Edits a listing in place. `listing`/`specs`/`priceNote` are replaced
 * wholesale (the form always sends the full set), and an explicit
 * `undefined` for one of them clears it. Returns undefined if no such product. */
export async function updateProduct(id: string, patch: ProductUpdate): Promise<ProductRecord | undefined> {
  await ensureDemoProducts();
  if (!isDbConfigured()) {
    const existing = memoryProducts.get(id);
    if (!existing) return undefined;
    const next: ProductRecord = { ...existing, ...patch };
    memoryProducts.set(id, next);
    return withMemoryImages(next);
  }
  const prisma = getPrisma()!;
  if (!(await prisma.product.findUnique({ where: { id } }))) return undefined;
  const json = (v: unknown) => (v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
  const row = await prisma.product.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...("specs" in patch ? { specs: json(patch.specs) } : {}),
      ...("priceNote" in patch ? { priceNote: patch.priceNote ?? null } : {}),
      ...("listing" in patch ? { listing: json(patch.listing) } : {}),
    },
    include: IMAGE_IDS,
  });
  return fromProductRow(row);
}

function fromProductRow(row: {
  id: string; vendorId: string; name: string; category: string; summary: string;
  description: string; specs: unknown; priceNote: string | null; listing?: unknown; createdAt: Date;
  images?: { id: string }[];
}): ProductRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    name: row.name,
    category: row.category,
    summary: row.summary,
    description: row.description,
    specs: (row.specs as Record<string, string> | null) ?? undefined,
    priceNote: row.priceNote ?? undefined,
    listing: (row.listing as ProductListing | null) ?? undefined,
    imageIds: (row.images ?? []).map((i) => i.id),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ProductFilter {
  category?: string;
  q?: string;
  vendorId?: string;
}

/**
 * Search across the catalogue — the closest thing to "Google for renewable
 * products" this phase ships: Postgres ILIKE across product fields AND the
 * extracted text of every uploaded manual/spec sheet (in-memory: plain
 * substring matching over the same fields). Deliberately not vector/semantic
 * search — at this catalogue size, ILIKE-across-manuals is honestly
 * sufficient and adds no new infrastructure; upgrading to embeddings-based
 * search is a documented future step once the catalogue outgrows this
 * (mirrors the Hetzner-deferral pattern in PHASE2_BUILD_PLAN.md).
 */
export async function listProducts(filter: ProductFilter = {}): Promise<ProductRecord[]> {
  await ensureDemoProducts();
  const { category, q, vendorId } = filter;
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.product.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(vendorId ? { vendorId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { summary: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { documents: { some: { extractedText: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: IMAGE_IDS,
    });
    return rows.map(fromProductRow);
  }

  let products = [...memoryProducts.values()].map(withMemoryImages);
  if (category) products = products.filter((p) => p.category === category);
  if (vendorId) products = products.filter((p) => p.vendorId === vendorId);
  if (q) {
    const docTextByProduct = new Map<string, string[]>();
    for (const doc of memoryDocuments.values()) {
      if (!doc.extractedText) continue;
      const list = docTextByProduct.get(doc.meta.productId) ?? [];
      list.push(doc.extractedText);
      docTextByProduct.set(doc.meta.productId, list);
    }
    products = products.filter((p) =>
      matchesQuery([p.name, p.summary, p.description, ...(docTextByProduct.get(p.id) ?? [])], q),
    );
  }
  return products.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(id: string): Promise<ProductRecord | undefined> {
  await ensureDemoProducts();
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const row = await prisma.product.findUnique({ where: { id }, include: IMAGE_IDS });
    return row ? fromProductRow(row) : undefined;
  }
  const found = memoryProducts.get(id);
  return found ? withMemoryImages(found) : undefined;
}

/** Marketplace administration — removes a listing (and its documents and
 * images; the Postgres schema cascades both on Product delete, mirrored here
 * for the in-memory fallback since a plain Map has no such thing). */
export async function deleteProduct(id: string): Promise<boolean> {
  if (!isDbConfigured()) {
    if (!memoryProducts.has(id)) return false;
    memoryProducts.delete(id);
    for (const [docId, doc] of memoryDocuments) {
      if (doc.meta.productId === id) memoryDocuments.delete(docId);
    }
    for (const [imageId, image] of memoryImages) {
      if (image.productId === id) memoryImages.delete(imageId);
    }
    return true;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.product.delete({ where: { id } });
  return true;
}

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB — generous for a manual/spec-sheet PDF, small enough to store as a DB blob without real object storage.

export class DocumentTooLargeError extends Error {
  constructor() {
    super(`Documents must be ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB or smaller`);
    this.name = "DocumentTooLargeError";
  }
}

export class UnsupportedDocumentTypeError extends Error {
  constructor() {
    super("Only PDF and plain-text documents are supported right now");
    this.name = "UnsupportedDocumentTypeError";
  }
}

/** Only ever called with a type addProductDocument has already validated
 * (text/plain or application/pdf), so no third fallback branch here. */
async function extractText(mimeType: string, data: Buffer): Promise<string | undefined> {
  if (mimeType === "text/plain") return data.toString("utf-8");
  let parser: import("pdf-parse").PDFParse | undefined;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data });
    const result = await parser.getText();
    return result.text?.trim() || undefined;
  } catch {
    return undefined; // corrupt/unreadable PDF — the file itself is still stored and downloadable.
  } finally {
    await parser?.destroy();
  }
}

/** Uploads a product manual/spec sheet: validates type/size, extracts text
 * (best-effort) so the AI can answer questions grounded in it, and stores
 * the raw bytes as a DB blob — no object-storage vendor added for this
 * phase's catalogue size (see MAX_DOCUMENT_BYTES). */
export async function addProductDocument(
  productId: string,
  file: { filename: string; mimeType: string; data: Buffer },
): Promise<ProductDocumentMeta> {
  if (file.data.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentTooLargeError();
  if (file.mimeType !== "application/pdf" && file.mimeType !== "text/plain") {
    throw new UnsupportedDocumentTypeError();
  }

  const extractedText = await extractText(file.mimeType, file.data);
  const meta: ProductDocumentMeta = {
    id: randomUUID(),
    productId,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.data.byteLength,
    createdAt: new Date().toISOString(),
    hasExtractedText: Boolean(extractedText),
  };

  if (!isDbConfigured()) {
    memoryDocuments.set(meta.id, { meta, data: file.data, extractedText });
    return meta;
  }
  const prisma = getPrisma()!;
  await prisma.productDocument.create({
    data: {
      id: meta.id,
      productId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      data: new Uint8Array(file.data),
      extractedText,
      createdAt: new Date(meta.createdAt),
    },
  });
  return meta;
}

export async function listProductDocuments(productId: string): Promise<ProductDocumentMeta[]> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.productDocument.findMany({
      where: { productId },
      select: { id: true, productId: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true, extractedText: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id, productId: r.productId, filename: r.filename, mimeType: r.mimeType,
      sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), hasExtractedText: Boolean(r.extractedText),
    }));
  }
  return [...memoryDocuments.values()]
    .filter((d) => d.meta.productId === productId)
    .map((d) => d.meta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProductDocument(docId: string): Promise<{ meta: ProductDocumentMeta; data: Buffer } | undefined> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const row = await prisma.productDocument.findUnique({ where: { id: docId } });
    if (!row) return undefined;
    return {
      meta: {
        id: row.id, productId: row.productId, filename: row.filename, mimeType: row.mimeType,
        sizeBytes: row.sizeBytes, createdAt: row.createdAt.toISOString(), hasExtractedText: Boolean(row.extractedText),
      },
      data: Buffer.from(row.data),
    };
  }
  const doc = memoryDocuments.get(docId);
  return doc ? { meta: doc.meta, data: doc.data } : undefined;
}

/** Text excerpts for AI grounding — never the raw binary, just what was
 * extracted, capped per document so a handful of manuals stay well within a
 * single prompt's context budget. */
export async function getProductDocumentTexts(productId: string, maxCharsPerDoc = 6000): Promise<{ filename: string; text: string }[]> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.productDocument.findMany({
      where: { productId, NOT: { extractedText: null } },
      select: { filename: true, extractedText: true },
    });
    return rows
      .filter((r) => r.extractedText)
      .map((r) => ({ filename: r.filename, text: r.extractedText!.slice(0, maxCharsPerDoc) }));
  }
  return [...memoryDocuments.values()]
    .filter((d) => d.meta.productId === productId && d.extractedText)
    .map((d) => ({ filename: d.meta.filename, text: d.extractedText!.slice(0, maxCharsPerDoc) }));
}

export const MAX_PRODUCT_IMAGES = 6;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB — a full-size listing photo, small enough to store as a DB blob.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class ImageTooLargeError extends Error {
  constructor() {
    super(`Photos must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`);
    this.name = "ImageTooLargeError";
  }
}

export class UnsupportedImageTypeError extends Error {
  constructor() {
    super("Photos must be JPEG, PNG or WebP");
    this.name = "UnsupportedImageTypeError";
  }
}

export class TooManyImagesError extends Error {
  constructor() {
    super(`A listing can have at most ${MAX_PRODUCT_IMAGES} photos`);
    this.name = "TooManyImagesError";
  }
}

/** Adds a listing photo at the end of the gallery. Same DB-blob storage as
 * addProductDocument; the first photo becomes the card's hero image. */
export async function addProductImage(productId: string, file: { mimeType: string; data: Buffer }): Promise<{ id: string }> {
  if (!IMAGE_TYPES.includes(file.mimeType)) throw new UnsupportedImageTypeError();
  if (file.data.byteLength > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
  const id = randomUUID();

  if (!isDbConfigured()) {
    const existing = memoryImageIds(productId);
    if (existing.length >= MAX_PRODUCT_IMAGES) throw new TooManyImagesError();
    const lastPosition = existing.length ? memoryImages.get(existing[existing.length - 1])!.position : -1;
    memoryImages.set(id, { id, productId, mimeType: file.mimeType, data: file.data, position: lastPosition + 1 });
    return { id };
  }
  const prisma = getPrisma()!;
  const existing = await prisma.productImage.findMany({ where: { productId }, select: { position: true }, orderBy: { position: "desc" } });
  if (existing.length >= MAX_PRODUCT_IMAGES) throw new TooManyImagesError();
  await prisma.productImage.create({
    data: {
      id, productId, mimeType: file.mimeType, sizeBytes: file.data.byteLength,
      data: new Uint8Array(file.data), position: (existing[0]?.position ?? -1) + 1,
    },
  });
  return { id };
}

export async function getProductImage(imageId: string): Promise<{ productId: string; mimeType: string; data: Buffer } | undefined> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const row = await prisma.productImage.findUnique({ where: { id: imageId } });
    return row ? { productId: row.productId, mimeType: row.mimeType, data: Buffer.from(row.data) } : undefined;
  }
  const img = memoryImages.get(imageId);
  return img ? { productId: img.productId, mimeType: img.mimeType, data: img.data } : undefined;
}

/** Removes one photo from a product's gallery. False if it isn't that product's. */
export async function deleteProductImage(productId: string, imageId: string): Promise<boolean> {
  if (!isDbConfigured()) {
    if (memoryImages.get(imageId)?.productId !== productId) return false;
    memoryImages.delete(imageId);
    return true;
  }
  const prisma = getPrisma()!;
  const row = await prisma.productImage.findUnique({ where: { id: imageId }, select: { productId: true } });
  if (row?.productId !== productId) return false;
  await prisma.productImage.delete({ where: { id: imageId } });
  return true;
}
