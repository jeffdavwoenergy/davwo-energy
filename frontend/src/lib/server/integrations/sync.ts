// Integration sync: runs each connection's connector, persists the devices it
// finds as the org's assets (upsert, never duplicated) plus their hourly
// history as AssetReadings, and keeps a per-org in-memory "live snapshot"
// (devices + 30 days of hourly history) that the dashboards, the EV engine
// network and ANI read synchronously.
//
// Freshness: a snapshot older than STALE_MS is refreshed on the next request
// that needs it (one in-flight sync per org per instance) — after that
// request's response is sent, so users get the last snapshot instantly; only
// an instance with no snapshot yet waits for the provider. A failed sync keeps
// serving the previous snapshot; with none, it rebuilds from what's already in
// the database, so a provider outage degrades to "last known" rather than to
// fake data.

import { after } from "next/server";
import { listConnections, createConnection, connectionSecret, recordSync, type Connection } from "@/lib/server/integrations/connections";
import { discoverVrm, VRM_DEMO_SITE_IDS, VrmError, type DiscoveredDevice, type HourlyPoint } from "@/lib/server/integrations/victron";
import { upsertExternalAssets, listUserAssets, type UserAsset } from "@/lib/server/assetsStore";
import { appendSyncedReadings, listReadingsForOrg } from "@/lib/server/assetReadings";
import { isDbConfigured } from "@/lib/server/prisma";
import { isLiveTenant } from "@/lib/server/tenants";
import { buildLiveNetwork } from "@/lib/server/integrations/liveNetwork";
import type { Network } from "@/lib/ani/dataGenerator";

export const STALE_MS = 5 * 60_000;
const LIVE_ORG_CACHE_MS = 60_000;

export interface LiveDevice extends DiscoveredDevice {
  assetId: string;
  connectionId: string;
  provider: string;
}

export interface LiveSnapshot {
  orgId: string;
  at: number;
  devices: LiveDevice[];
  network: Network;
  /** "provider" = fetched from the provider; "database" = last-synced data
   * from Postgres, served to a cold instance while a provider refresh runs;
   * "stored" = rebuilt from the database because the provider fetch failed. */
  origin: "provider" | "database" | "stored";
  errors: string[];
}

const snapshots = new Map<string, LiveSnapshot>();
const inflight = new Map<string, Promise<LiveSnapshot | null>>();
const liveOrgCache = new Map<string, { live: boolean; at: number }>();

/** True when the org's data should come from its integrations instead of the
 * synthetic demo network: the dedicated live tenant, or any org that has
 * connected a device platform. */
export async function isLiveOrg(orgId: string): Promise<boolean> {
  if (isLiveTenant(orgId)) return true;
  const hit = liveOrgCache.get(orgId);
  if (hit && Date.now() - hit.at < LIVE_ORG_CACHE_MS) return hit.live;
  const live = (await listConnections(orgId).catch(() => [])).some((c) => c.status !== "disabled");
  liveOrgCache.set(orgId, { live, at: Date.now() });
  return live;
}

/** Synchronous read of the org's current snapshot (null outside a live org,
 * or before the first sync on this instance). */
export function liveSnapshot(orgId: string): LiveSnapshot | null {
  return snapshots.get(orgId) ?? null;
}

export function forgetOrg(orgId: string): void {
  snapshots.delete(orgId);
  liveOrgCache.delete(orgId);
}

/** The live tenant always has the Victron demo connection — created on first
 * use so a fresh database needs no manual setup. */
async function ensureDemoConnection(orgId: string): Promise<void> {
  if (!isLiveTenant(orgId)) return;
  const existing = await listConnections(orgId);
  if (existing.some((c) => c.provider === "victron_vrm")) return;
  await createConnection(orgId, {
    provider: "victron_vrm",
    label: "Victron VRM: public demo sites",
    metadata: { demo: true, siteIds: VRM_DEMO_SITE_IDS },
  });
}

async function discover(orgId: string, conn: Connection): Promise<DiscoveredDevice[]> {
  if (conn.provider !== "victron_vrm") throw new Error(`No connector for ${conn.provider} yet`);
  if (conn.metadata.demo) return discoverVrm({ mode: "demo" }, { siteIds: conn.metadata.siteIds });
  const token = await connectionSecret(orgId, conn.id);
  if (!token) throw new Error("Connection has no stored credentials");
  return discoverVrm({ mode: "token", token }, { siteIds: conn.metadata.siteIds });
}

/** Runs one connection end-to-end. Returns its devices (with history) mapped
 * to their stored asset ids. Records success/failure on the connection. */
export async function syncConnection(orgId: string, conn: Connection): Promise<LiveDevice[]> {
  try {
    const found = await discover(orgId, conn);
    const assets = await upsertExternalAssets(orgId, conn.provider, conn.id, found);
    const devices = found.map((d, i) => ({ ...d, assetId: assets[i].id, connectionId: conn.id, provider: conn.provider }));
    await Promise.all(
      devices.map((d) =>
        appendSyncedReadings(orgId, d.assetId, d.history.map((h) => ({
          recordedAt: h.ts,
          // Battery history carries signed net power; readings store magnitude.
          powerKw: Math.abs(h.powerKw),
          energyKwh: h.energyKwh,
        }))).catch((err) => {
          console.error(`[integrations] readings write failed for ${d.assetId}:`, err);
          return 0;
        }),
      ),
    );
    await recordSync(orgId, conn.id, { ok: true, deviceCount: devices.length });
    return devices;
  } catch (err) {
    const msg = err instanceof VrmError || err instanceof Error ? err.message : String(err);
    console.error(`[integrations] sync failed for ${conn.provider} (${conn.id}):`, msg);
    await recordSync(orgId, conn.id, { ok: false, error: msg }).catch(() => undefined);
    throw err;
  }
}

/** Last-known devices from the database (assets + up to 30 days of readings),
 * used when the provider can't be reached and this instance has no snapshot. */
async function devicesFromStore(orgId: string): Promise<LiveDevice[]> {
  const assets = (await listUserAssets(orgId)).filter((a) => a.external);
  if (!assets.length) return [];
  const now = Date.now();
  const readings = await listReadingsForOrg(orgId, now - 30 * 24 * 3_600_000, now);
  const byAsset = new Map<string, HourlyPoint[]>();
  for (const r of readings) {
    const list = byAsset.get(r.assetId) ?? [];
    list.push({ ts: new Date(r.recorded_at).getTime(), powerKw: r.power_kw ?? 0, energyKwh: r.energy_kwh ?? 0 });
    byAsset.set(r.assetId, list);
  }
  return assets.map((a: UserAsset) => ({
    externalId: a.external!.id,
    type: a.type,
    name: a.name,
    site: a.site,
    capacityKw: a.capacity_kw,
    manufacturer: a.manufacturer ?? "",
    model: a.model ?? "",
    location: a.location,
    status: a.status,
    currentLoadKw: a.current_load_kw,
    utilisationPct: a.utilisation_pct,
    specs: a.specs ?? {},
    telemetry: a.telemetry ?? {},
    lastSeenAt: a.last_seen_at ?? null,
    history: (byAsset.get(a.id) ?? []).sort((x, y) => x.ts - y.ts),
    assetId: a.id,
    connectionId: a.external!.connection_id ?? "",
    provider: a.external!.source,
  }));
}

async function refresh(orgId: string): Promise<LiveSnapshot | null> {
  await ensureDemoConnection(orgId);
  const conns = (await listConnections(orgId)).filter((c) => c.status !== "disabled");
  if (!conns.length) return null;
  const errors: string[] = [];
  const results = await Promise.all(
    conns.map((c) => syncConnection(orgId, c).catch((err: Error) => {
      errors.push(`${c.label}: ${err.message}`);
      return null;
    })),
  );
  const ok = results.filter((r): r is LiveDevice[] => r !== null);
  const prev = snapshots.get(orgId);
  const failedIds = new Set(conns.filter((_, i) => results[i] === null).map((c) => c.id));
  let devices: LiveDevice[];
  let origin: LiveSnapshot["origin"] = "provider";
  if (!failedIds.size) devices = ok.flat();
  else if (prev && !ok.length) return { ...prev, errors };
  else if (ok.length) devices = [...ok.flat(), ...(prev?.devices.filter((d) => failedIds.has(d.connectionId)) ?? [])];
  else {
    devices = await devicesFromStore(orgId);
    origin = "stored";
  }
  const snap: LiveSnapshot = { orgId, at: Date.now(), devices, network: buildLiveNetwork(devices), origin, errors };
  snapshots.set(orgId, snap);
  liveOrgCache.set(orgId, { live: true, at: Date.now() });
  return snap;
}

/** Makes sure a live org has a fresh snapshot before a request reads it.
 * No-op (and no DB/provider calls beyond the cached live-org check) for
 * ordinary demo orgs. Never throws — a request should still render. */
export async function ensureLiveData(orgId: string, opts: { force?: boolean } = {}): Promise<LiveSnapshot | null> {
  if (!(await isLiveOrg(orgId))) return null;
  const cur = snapshots.get(orgId);
  if (!opts.force && cur && Date.now() - cur.at < STALE_MS) return cur;
  if (!opts.force && cur) return refreshAfterResponse(orgId, cur);
  // Cold instance (common on serverless): with a database, serve the last
  // synced devices straight from Postgres and refresh from the provider after
  // the response, instead of making this request wait on the provider.
  if (!opts.force && isDbConfigured()) {
    const devices = await devicesFromStore(orgId).catch(() => []);
    if (devices.length) {
      const warm: LiveSnapshot = { orgId, at: Date.now(), devices, network: buildLiveNetwork(devices), origin: "database", errors: [] };
      snapshots.set(orgId, warm);
      return refreshAfterResponse(orgId, warm, true);
    }
  }
  return runRefresh(orgId);
}

/** Serves `cur` now and refreshes once the response is sent. Outside a
 * request (scripts, tests, cron) after() throws, so it refreshes inline.
 * `backdate` marks a warm-start snapshot stale so the next request on this
 * instance also refreshes if the background one didn't complete. */
function refreshAfterResponse(orgId: string, cur: LiveSnapshot, backdate = false): Promise<LiveSnapshot | null> | LiveSnapshot {
  try {
    after(() => runRefresh(orgId).then(() => undefined));
    if (backdate) cur.at = Date.now() - STALE_MS;
    return cur;
  } catch {
    return runRefresh(orgId);
  }
}

function runRefresh(orgId: string): Promise<LiveSnapshot | null> {
  const running = inflight.get(orgId);
  if (running) return running;
  const p = refresh(orgId)
    .catch((err) => {
      console.error(`[integrations] refresh failed for ${orgId}:`, err);
      return snapshots.get(orgId) ?? null;
    })
    .finally(() => inflight.delete(orgId));
  inflight.set(orgId, p);
  return p;
}
