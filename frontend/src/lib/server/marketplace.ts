import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/server/prisma";
import { findSupplierById } from "@/lib/server/suppliers";

/**
 * Marketplace Preview (MVP spec, module 6): curated vendor catalogue only —
 * no payments, transactions or order processing. Static seed data (there's
 * no real vendor-onboarding pipeline yet), same "synthetic but structured"
 * approach as the rest of the demo dataset until real vendors onboard.
 */
export type VendorCategory = "ev-chargers" | "battery" | "solar" | "energy-services" | "consulting";

export interface Vendor {
  id: string;
  name: string;
  category: VendorCategory;
  tagline: string;
  description: string;
  region: string;
  rating: number;
  reviews: number;
  logo_initials: string;
  highlights: string[];
  contact_email: string;
  website: string;
  verified: boolean;
}

export const CATEGORIES: { id: VendorCategory; label: string }[] = [
  { id: "ev-chargers", label: "EV Chargers" },
  { id: "battery", label: "Battery Solutions" },
  { id: "solar", label: "Solar Solutions" },
  { id: "energy-services", label: "Energy Services" },
  { id: "consulting", label: "Consulting Services" },
];

const VENDORS: Vendor[] = [
  {
    id: "voltway-networks",
    name: "Voltway Networks",
    category: "ev-chargers",
    tagline: "Rapid DC charging hardware for depots and forecourts.",
    description:
      "Voltway designs and installs 50–350kW DC rapid chargers with OCPP 2.0.1 support, built for high-utilisation fleet depots across the UK.",
    region: "Manchester, UK",
    rating: 4.7,
    reviews: 58,
    logo_initials: "VN",
    highlights: ["OCPP 2.0.1", "50–350kW DC", "24/7 remote monitoring"],
    contact_email: "partnerships@voltwaynetworks.example",
    website: "https://voltwaynetworks.example",
    verified: true,
  },
  {
    id: "chargepoint-collective",
    name: "ChargePoint Collective",
    category: "ev-chargers",
    tagline: "Workplace & residential AC charging, installed in days.",
    description:
      "A UK-wide installer network for 7–22kW AC chargers, covering workplace car parks, new-build residential and retrofit driveways.",
    region: "London, UK",
    rating: 4.5,
    reviews: 134,
    logo_initials: "CC",
    highlights: ["OZEV-approved installer", "Smart tariff scheduling", "5-year warranty"],
    contact_email: "sales@chargepointcollective.example",
    website: "https://chargepointcollective.example",
    verified: true,
  },
  {
    id: "gridstore-energy",
    name: "GridStore Energy",
    category: "battery",
    tagline: "Containerised BESS for commercial sites, 100kWh–2MWh.",
    description:
      "GridStore supplies and commissions containerised battery energy storage systems sized for peak-shaving, demand response and solar firming.",
    region: "Leeds, UK",
    rating: 4.6,
    reviews: 41,
    logo_initials: "GE",
    highlights: ["100kWh–2MWh", "10-year performance guarantee", "Grid services ready"],
    contact_email: "hello@gridstoreenergy.example",
    website: "https://gridstoreenergy.example",
    verified: true,
  },
  {
    id: "northbank-storage",
    name: "Northbank Storage Systems",
    category: "battery",
    tagline: "Second-life EV battery storage at lower cost per kWh.",
    description:
      "Repurposed EV battery packs re-engineered into stationary storage units, offering a lower-cost, lower-carbon alternative to new cells.",
    region: "Newcastle, UK",
    rating: 4.2,
    reviews: 19,
    logo_initials: "NS",
    highlights: ["Second-life cells", "30% lower cost/kWh", "Full traceability"],
    contact_email: "info@northbankstorage.example",
    website: "https://northbankstorage.example",
    verified: false,
  },
  {
    id: "solaris-fields",
    name: "Solaris Fields",
    category: "solar",
    tagline: "Commercial rooftop & ground-mount solar EPC.",
    description:
      "End-to-end solar EPC for commercial rooftops and ground-mount arrays, from feasibility through to grid connection and O&M.",
    region: "Bristol, UK",
    rating: 4.8,
    reviews: 76,
    logo_initials: "SF",
    highlights: ["MCS certified", "PPA financing available", "25-year panel warranty"],
    contact_email: "projects@solarisfields.example",
    website: "https://solarisfields.example",
    verified: true,
  },
  {
    id: "brightgrid-solar",
    name: "BrightGrid Solar",
    category: "solar",
    tagline: "Solar + storage hybrid systems for SMEs.",
    description:
      "BrightGrid pairs rooftop solar with on-site battery storage for small and medium businesses looking to cut demand charges.",
    region: "Cardiff, UK",
    rating: 4.4,
    reviews: 33,
    logo_initials: "BS",
    highlights: ["Solar + storage bundles", "Flexible finance", "Remote performance dashboard"],
    contact_email: "team@brightgridsolar.example",
    website: "https://brightgridsolar.example",
    verified: false,
  },
  {
    id: "meterwise-services",
    name: "Meterwise Energy Services",
    category: "energy-services",
    tagline: "Half-hourly metering, billing and settlement.",
    description:
      "Meter operator and data collector services for commercial energy portfolios, including half-hourly settlement and validated billing.",
    region: "Birmingham, UK",
    rating: 4.3,
    reviews: 27,
    logo_initials: "MS",
    highlights: ["MOP/MAM/DC accredited", "Automated validation", "Multi-site billing"],
    contact_email: "operations@meterwise.example",
    website: "https://meterwise.example",
    verified: true,
  },
  {
    id: "flexbalance-drs",
    name: "FlexBalance DR Services",
    category: "energy-services",
    tagline: "Demand response & flexibility market access.",
    description:
      "Aggregates flexible commercial and industrial load into National Grid ESO balancing and capacity market programmes.",
    region: "Edinburgh, UK",
    rating: 4.5,
    reviews: 22,
    logo_initials: "FD",
    highlights: ["ESO-accredited aggregator", "No-cost enrolment", "Revenue share model"],
    contact_email: "enrol@flexbalance.example",
    website: "https://flexbalance.example",
    verified: true,
  },
  {
    id: "atlas-carbon-advisory",
    name: "Atlas Carbon Advisory",
    category: "consulting",
    tagline: "Net-zero roadmaps & SECR/ESOS compliance.",
    description:
      "Independent energy and carbon consultancy supporting SECR and ESOS compliance, net-zero target-setting and decarbonisation roadmaps.",
    region: "London, UK",
    rating: 4.9,
    reviews: 64,
    logo_initials: "AC",
    highlights: ["SECR & ESOS specialists", "SBTi-aligned targets", "Board-ready reporting"],
    contact_email: "enquiries@atlascarbon.example",
    website: "https://atlascarbon.example",
    verified: true,
  },
  {
    id: "wattline-consulting",
    name: "Wattline Consulting",
    category: "consulting",
    tagline: "Grid connection & feasibility studies.",
    description:
      "Technical consulting for DNO/DSO grid connection applications, feasibility studies and infrastructure investment appraisal.",
    region: "Glasgow, UK",
    rating: 4.6,
    reviews: 18,
    logo_initials: "WC",
    highlights: ["DNO connection specialists", "Feasibility studies", "Investment appraisal"],
    contact_email: "advice@wattlineconsulting.example",
    website: "https://wattlineconsulting.example",
    verified: false,
  },
];

export function listVendors(category?: string): Vendor[] {
  if (category && CATEGORIES.some((c) => c.id === category)) {
    return VENDORS.filter((v) => v.category === category);
  }
  return VENDORS;
}

export function getVendor(id: string): Vendor | undefined {
  return VENDORS.find((v) => v.id === id);
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Static VENDORS first, then a real self-service Supplier account — mirrors
 * resolveTenant()'s static-then-dynamic pattern in tenants.ts. Anywhere a
 * vendor might be a real registered supplier (not just the curated seed
 * list) should call this instead of getVendor(). */
export async function resolveVendor(id: string): Promise<Vendor | undefined> {
  const stat = getVendor(id);
  if (stat) return stat;
  const supplier = await findSupplierById(id);
  if (!supplier) return undefined;
  return {
    id: supplier.id,
    name: supplier.companyName,
    category: supplier.category as VendorCategory,
    tagline: "",
    description: "",
    region: supplier.region ?? "",
    rating: 0,
    reviews: 0,
    logo_initials: initials(supplier.companyName),
    highlights: [],
    contact_email: supplier.email,
    website: supplier.website ?? "",
    verified: supplier.verified,
  };
}

export type LeadStatus = "new" | "responded" | "accepted" | "declined";

export interface VendorLead {
  vendorId: string;
  name: string;
  email: string;
  message: string;
  orgId: string;
  userId: string;
}

/** In-memory storage shape is exactly the API-facing Lead shape — one type,
 * not two hand-kept-in-sync copies (see Lead below). */
type StoredLead = Lead;

/** Was Postgres-only with no fallback at all (a lead was silently dropped
 * without a DB, not even held in memory) — now matches every other store's
 * graceful-degradation pattern, since suppliers reading their leads back
 * (via /api/supplier/leads) needs this to actually work in dev/no-DB mode. */
const memoryLeads: StoredLead[] = [];

/** Stores the lead in Postgres when configured, in-memory otherwise. Returns
 * whether it was persisted to a real database, for callers/logging that
 * care — the UI itself doesn't need to know which path served it. */
export async function saveLead(lead: VendorLead): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) {
    memoryLeads.push({ ...lead, id: randomUUID(), status: "new", createdAt: new Date().toISOString() });
    return false;
  }
  await prisma.vendorLead.create({ data: lead });
  return true;
}

export interface Lead extends VendorLead {
  id: string;
  status: LeadStatus;
  response?: string;
  respondedAt?: string;
  decidedAt?: string;
  createdAt: string;
  /** Only populated by listLeadsForOrg — the buyer already knows who they
   * are for listLeadsForVendor, so resolving it there would be wasted work. */
  vendorName?: string;
}

function mapLeadRow(r: {
  id: string; vendorId: string; name: string; email: string; message: string;
  orgId: string; userId: string; status: LeadStatus;
  response: string | null; respondedAt: Date | null; decidedAt: Date | null; createdAt: Date;
}): Lead {
  return {
    id: r.id, vendorId: r.vendorId, name: r.name, email: r.email, message: r.message,
    orgId: r.orgId, userId: r.userId, status: r.status,
    response: r.response ?? undefined,
    respondedAt: r.respondedAt?.toISOString(),
    decidedAt: r.decidedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Enquiries sent to one vendor — the supplier portal's "my leads" view. */
export async function listLeadsForVendor(vendorId: string): Promise<Lead[]> {
  const prisma = getPrisma();
  if (!prisma) {
    return memoryLeads
      .filter((l) => l.vendorId === vendorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const rows = await prisma.vendorLead.findMany({ where: { vendorId }, orderBy: { createdAt: "desc" } });
  return rows.map(mapLeadRow);
}

/** Enquiries a buyer org has sent — the "my enquiries" view, so submitting
 * an enquiry isn't a fire-and-forget dead end with no way to see the
 * supplier's response later. Resolves each vendorId to its display name
 * here (deduped, in parallel) rather than leaving the UI to make one
 * request per distinct vendor. */
export async function listLeadsForOrg(orgId: string): Promise<Lead[]> {
  const prisma = getPrisma();
  const leads = !prisma
    ? memoryLeads.filter((l) => l.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : (await prisma.vendorLead.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } })).map(mapLeadRow);

  const vendorIds = [...new Set(leads.map((l) => l.vendorId))];
  const vendorNames = new Map(
    await Promise.all(vendorIds.map(async (id) => [id, (await resolveVendor(id))?.name] as const)),
  );
  return leads.map((l) => ({ ...l, vendorName: vendorNames.get(l.vendorId) }));
}

export class LeadNotFoundError extends Error {
  constructor() {
    super("Enquiry not found");
    this.name = "LeadNotFoundError";
  }
}

export class InvalidLeadTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLeadTransitionError";
  }
}

const DECIDED_STATUSES = ["accepted", "declined"] as const;

/** Supplier responds to a lead sent to their own vendorId — new/responded ->
 * responded (a supplier may revise their reply before the buyer decides).
 * Rejects once the buyer has already accepted/declined: without this guard
 * a supplier could silently reopen and overwrite a decided lead, leaving a
 * self-contradictory row (decidedAt set but status back to "responded").
 * Throws LeadNotFoundError for an unknown id or one belonging to a
 * different vendor (same not-found-for-wrong-owner shape used elsewhere in
 * this codebase, so a supplier can't probe for other vendors' lead ids).
 * The Postgres path updates conditionally in one statement (not
 * read-then-write) so two concurrent calls can't both pass a staleness
 * check before either write lands. */
export async function respondToLead(vendorId: string, leadId: string, response: string): Promise<Lead> {
  const prisma = getPrisma();
  if (!prisma) {
    const lead = memoryLeads.find((l) => l.id === leadId && l.vendorId === vendorId);
    if (!lead) throw new LeadNotFoundError();
    if ((DECIDED_STATUSES as readonly string[]).includes(lead.status)) {
      throw new InvalidLeadTransitionError("The buyer has already decided on this enquiry.");
    }
    lead.status = "responded";
    lead.response = response;
    lead.respondedAt = new Date().toISOString();
    return { ...lead };
  }

  const result = await prisma.vendorLead.updateMany({
    where: { id: leadId, vendorId, status: { notIn: [...DECIDED_STATUSES] } },
    data: { status: "responded", response, respondedAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.vendorLead.findUnique({ where: { id: leadId } });
    if (!existing || existing.vendorId !== vendorId) throw new LeadNotFoundError();
    throw new InvalidLeadTransitionError("The buyer has already decided on this enquiry.");
  }
  const updated = await prisma.vendorLead.findUnique({ where: { id: leadId } });
  return mapLeadRow(updated!);
}

/** Buyer org accepts/declines a lead they sent — only once the supplier has
 * responded, since deciding on an enquiry nobody's addressed yet doesn't
 * make sense as a state transition. Same conditional-update-in-one-statement
 * approach as respondToLead, for the same race-safety reason (e.g. a
 * doubled-clicked Accept/Decline, or two open tabs, must not both win). */
export async function decideLead(orgId: string, leadId: string, decision: "accepted" | "declined"): Promise<Lead> {
  const prisma = getPrisma();
  if (!prisma) {
    const lead = memoryLeads.find((l) => l.id === leadId && l.orgId === orgId);
    if (!lead) throw new LeadNotFoundError();
    if (lead.status !== "responded") throw new InvalidLeadTransitionError("This enquiry doesn't have a supplier response yet.");
    lead.status = decision;
    lead.decidedAt = new Date().toISOString();
    return { ...lead };
  }

  const result = await prisma.vendorLead.updateMany({
    where: { id: leadId, orgId, status: "responded" },
    data: { status: decision, decidedAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.vendorLead.findUnique({ where: { id: leadId } });
    if (!existing || existing.orgId !== orgId) throw new LeadNotFoundError();
    throw new InvalidLeadTransitionError("This enquiry doesn't have a supplier response yet.");
  }
  const updated = await prisma.vendorLead.findUnique({ where: { id: leadId } });
  return mapLeadRow(updated!);
}
