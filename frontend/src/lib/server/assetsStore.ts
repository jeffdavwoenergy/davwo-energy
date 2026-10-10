import { randomUUID } from "node:crypto";
import type { AssetType as PrismaAssetType, AssetStatus as PrismaAssetStatus } from "@prisma/client";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import type { AssetType, AssetSpecs } from "@/lib/assetSpecs";

export type { AssetType, AssetSpecs };
export type AssetStatus = "healthy" | "degraded" | "down";

export interface UserAsset {
  id: string;
  name: string;
  type: AssetType;
  site: string;
  capacity_kw: number;
  status: AssetStatus;
  utilisation_pct: number;
  current_load_kw: number;
  location: { lat: number; lng: number } | null;
  source: "user";
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installed_at?: string;
  product_id?: string;
  /** Type-specific fields (vehicle reg/battery, solar panel count, …) — see assetSpecs.ts. */
  specs?: AssetSpecs;
  createdAt: string;
  updatedAt: string;
}

export interface NewAssetInput {
  name: string;
  type: AssetType;
  site: string;
  capacity_kw: number;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installed_at?: string;
  product_id?: string;
  specs?: AssetSpecs;
}

export interface AssetUpdate {
  status?: AssetStatus;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installed_at?: string;
  product_id?: string;
  current_load_kw?: number;
  utilisation_pct?: number;
  /** Replaces the stored specs (callers merge + validate first). */
  specs?: AssetSpecs;
}

/** Per-instance fallback when no DB is configured — same accepted limitation
 * as other module-level state in this codebase (resets on cold start, not
 * shared across serverless instances). */
const memoryAssets = new Map<string, UserAsset[]>();

const TYPE_TO_DB: Record<AssetType, PrismaAssetType> = {
  "EV Charger": "EV_CHARGER",
  Battery: "BATTERY",
  Solar: "SOLAR",
  Vehicle: "VEHICLE",
};
const TYPE_FROM_DB: Record<PrismaAssetType, AssetType> = {
  EV_CHARGER: "EV Charger",
  BATTERY: "Battery",
  SOLAR: "Solar",
  VEHICLE: "Vehicle",
};

function fromRow(row: {
  id: string; name: string; type: PrismaAssetType; site: string; capacityKw: number;
  status: PrismaAssetStatus; utilisationPct: number; currentLoadKw: number;
  locationLat: number | null; locationLng: number | null;
  manufacturer: string | null; model: string | null; serialNumber: string | null;
  installedAt: Date | null; productId: string | null; specs?: unknown; createdAt: Date; updatedAt: Date;
}): UserAsset {
  return {
    id: row.id,
    name: row.name,
    type: TYPE_FROM_DB[row.type],
    site: row.site,
    capacity_kw: row.capacityKw,
    status: row.status,
    utilisation_pct: row.utilisationPct,
    current_load_kw: row.currentLoadKw,
    location: row.locationLat != null && row.locationLng != null ? { lat: row.locationLat, lng: row.locationLng } : null,
    source: "user",
    manufacturer: row.manufacturer ?? undefined,
    model: row.model ?? undefined,
    serial_number: row.serialNumber ?? undefined,
    installed_at: row.installedAt ? row.installedAt.toISOString() : undefined,
    product_id: row.productId ?? undefined,
    specs: row.specs && typeof row.specs === "object" ? (row.specs as AssetSpecs) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listUserAssets(orgId: string): Promise<UserAsset[]> {
  if (!isDbConfigured()) return memoryAssets.get(orgId) ?? [];
  const prisma = getPrisma()!;
  const docs = await prisma.userAsset.findMany({ where: { orgId } });
  return docs.map(fromRow);
}

export async function getUserAsset(orgId: string, id: string): Promise<UserAsset | undefined> {
  if (!isDbConfigured()) return (memoryAssets.get(orgId) ?? []).find((a) => a.id === id);
  const prisma = getPrisma()!;
  const doc = await prisma.userAsset.findUnique({ where: { id } });
  return doc && doc.orgId === orgId ? fromRow(doc) : undefined;
}

export async function addUserAsset(orgId: string, input: NewAssetInput): Promise<UserAsset> {
  const now = new Date().toISOString();
  const asset: UserAsset = {
    id: `ua-${randomUUID()}`,
    name: input.name,
    type: input.type,
    site: input.site,
    capacity_kw: input.capacity_kw,
    status: "healthy",
    utilisation_pct: 0,
    current_load_kw: 0,
    location: null,
    source: "user",
    manufacturer: input.manufacturer,
    model: input.model,
    serial_number: input.serial_number,
    installed_at: input.installed_at,
    product_id: input.product_id,
    specs: input.specs,
    createdAt: now,
    updatedAt: now,
  };

  if (!isDbConfigured()) {
    const list = memoryAssets.get(orgId) ?? [];
    list.push(asset);
    memoryAssets.set(orgId, list);
    return asset;
  }
  const prisma = getPrisma()!;
  await prisma.userAsset.create({
    data: {
      id: asset.id,
      orgId,
      name: asset.name,
      type: TYPE_TO_DB[asset.type],
      site: asset.site,
      capacityKw: asset.capacity_kw,
      status: "healthy",
      utilisationPct: 0,
      currentLoadKw: 0,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serial_number,
      installedAt: asset.installed_at ? new Date(asset.installed_at) : undefined,
      productId: asset.product_id,
      ...(asset.specs ? { specs: asset.specs } : {}),
    },
  });
  return asset;
}

/** Updates status/technical-info/product-link fields on an org's own
 * asset. Returns undefined for an id that isn't a real user-registered
 * asset in this org (engine/preview assets never exist in this store, so
 * they naturally 404 here rather than needing a separate guard). */
export async function updateUserAsset(orgId: string, id: string, updates: AssetUpdate): Promise<UserAsset | undefined> {
  if (!isDbConfigured()) {
    const list = memoryAssets.get(orgId) ?? [];
    const asset = list.find((a) => a.id === id);
    if (!asset) return undefined;
    if (updates.status !== undefined) asset.status = updates.status;
    if (updates.manufacturer !== undefined) asset.manufacturer = updates.manufacturer;
    if (updates.model !== undefined) asset.model = updates.model;
    if (updates.serial_number !== undefined) asset.serial_number = updates.serial_number;
    if (updates.installed_at !== undefined) asset.installed_at = updates.installed_at || undefined;
    if (updates.product_id !== undefined) asset.product_id = updates.product_id;
    if (updates.current_load_kw !== undefined) asset.current_load_kw = updates.current_load_kw;
    if (updates.utilisation_pct !== undefined) asset.utilisation_pct = updates.utilisation_pct;
    if (updates.specs !== undefined) asset.specs = updates.specs;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.userAsset.findUnique({ where: { id } });
  if (!existing || existing.orgId !== orgId) return undefined;
  const doc = await prisma.userAsset.update({
    where: { id },
    data: {
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.manufacturer !== undefined ? { manufacturer: updates.manufacturer } : {}),
      ...(updates.model !== undefined ? { model: updates.model } : {}),
      ...(updates.serial_number !== undefined ? { serialNumber: updates.serial_number } : {}),
      ...(updates.installed_at !== undefined ? { installedAt: updates.installed_at ? new Date(updates.installed_at) : null } : {}),
      ...(updates.product_id !== undefined ? { productId: updates.product_id } : {}),
      ...(updates.current_load_kw !== undefined ? { currentLoadKw: updates.current_load_kw } : {}),
      ...(updates.utilisation_pct !== undefined ? { utilisationPct: updates.utilisation_pct } : {}),
      ...(updates.specs !== undefined ? { specs: updates.specs } : {}),
    },
  });
  return fromRow(doc);
}

export async function removeUserAsset(orgId: string, id: string): Promise<boolean> {
  if (!isDbConfigured()) {
    const list = memoryAssets.get(orgId) ?? [];
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.userAsset.findUnique({ where: { id } });
  if (!existing || existing.orgId !== orgId) return false;
  await prisma.userAsset.delete({ where: { id } });
  return true;
}
