// Connect / disconnect / status for an org's device integrations — the API
// routes stay thin and this is the one place that enforces the rules:
// credentials are proven against the provider before they're stored, and a
// disconnect removes everything the connection brought in.

import { INTEGRATION_PROVIDERS, providerById, type IntegrationProvider } from "@/lib/integrationCatalog";
import { createConnection, deleteConnection, getConnection, listConnections, type Connection } from "@/lib/server/integrations/connections";
import { ensureLiveData, forgetOrg, liveSnapshot, type LiveSnapshot } from "@/lib/server/integrations/sync";
import { vrmAuthHeader, vrmUser, VrmError, VRM_DEMO_SITE_IDS } from "@/lib/server/integrations/victron";
import { removeConnectionAssets } from "@/lib/server/assetsStore";
import { isLiveTenant } from "@/lib/server/tenants";

export class IntegrationInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "IntegrationInputError";
  }
}

export interface IntegrationsOverview {
  providers: IntegrationProvider[];
  connections: Connection[];
  live: null | {
    syncedAt: string;
    origin: LiveSnapshot["origin"];
    errors: string[];
    devices: { type: string; count: number }[];
  };
}

export async function integrationsOverview(orgId: string): Promise<IntegrationsOverview> {
  const snap = liveSnapshot(orgId);
  const counts = new Map<string, number>();
  for (const d of snap?.devices ?? []) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  return {
    providers: INTEGRATION_PROVIDERS,
    connections: await listConnections(orgId),
    live: snap
      ? { syncedAt: new Date(snap.at).toISOString(), origin: snap.origin, errors: snap.errors, devices: [...counts].map(([type, count]) => ({ type, count })) }
      : null,
  };
}

export interface ConnectInput {
  provider: string;
  label?: string;
  token?: string;
  demo?: boolean;
}

export async function connectIntegration(orgId: string, input: ConnectInput): Promise<{ connection: Connection; devices: number }> {
  const provider = providerById(input.provider);
  if (!provider) throw new IntegrationInputError("Unknown provider");
  if (provider.readiness !== "live") {
    throw new IntegrationInputError(`${provider.name} isn't connectable yet. It's assessed and queued (see the integration roadmap).`);
  }
  const demo = Boolean(input.demo);
  const token = (input.token ?? "").trim();
  if (!demo && !token) throw new IntegrationInputError("An access token is required");
  if (token.length > 512) throw new IntegrationInputError("That token is too long");

  const existing = await listConnections(orgId);
  if (demo && existing.some((c) => c.provider === provider.id && c.metadata.demo)) {
    throw new IntegrationInputError("The Victron demo sites are already connected", 409);
  }

  // Prove the credentials work before storing anything.
  let accountName: string;
  try {
    const user = await vrmUser(await vrmAuthHeader(demo ? { mode: "demo" } : { mode: "token", token }));
    accountName = user.name;
  } catch (err) {
    const status = err instanceof VrmError ? err.status : undefined;
    throw new IntegrationInputError(
      status === 401 || status === 403
        ? "Victron VRM rejected that token. Check it's a valid access token for your VRM account."
        : `Couldn't reach Victron VRM: ${(err as Error).message}`,
      422,
    );
  }

  const conn = await createConnection(orgId, {
    provider: provider.id,
    label: (input.label ?? "").trim().slice(0, 80) || (demo ? "Victron VRM: public demo sites" : `Victron VRM: ${accountName}`),
    secret: demo ? null : token,
    metadata: { demo, accountName, ...(demo ? { siteIds: VRM_DEMO_SITE_IDS } : {}) },
  });
  forgetOrg(orgId);
  const snap = await ensureLiveData(orgId, { force: true });
  return {
    connection: (await getConnection(orgId, conn.id)) ?? conn,
    devices: snap?.devices.filter((d) => d.connectionId === conn.id).length ?? 0,
  };
}

export async function disconnectIntegration(orgId: string, id: string): Promise<boolean> {
  const conn = await getConnection(orgId, id);
  if (!conn) return false;
  if (isLiveTenant(orgId) && conn.metadata.demo) {
    throw new IntegrationInputError("The live showcase account's demo connection is built in and can't be removed");
  }
  await removeConnectionAssets(orgId, id);
  await deleteConnection(orgId, id);
  forgetOrg(orgId);
  return true;
}

export async function syncNow(orgId: string): Promise<IntegrationsOverview> {
  await ensureLiveData(orgId, { force: true });
  return integrationsOverview(orgId);
}
