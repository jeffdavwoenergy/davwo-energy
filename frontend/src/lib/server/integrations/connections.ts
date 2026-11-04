// Per-org device-integration connections. Credentials are encrypted before
// they reach storage (crypto.ts) and never leave this module in plain text
// except to the connector that needs them. Same Postgres-with-in-memory-
// fallback pattern as every other store in src/lib/server.

import { randomUUID } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import { encryptSecret, decryptSecret } from "@/lib/server/integrations/crypto";
import type { IntegrationProviderId } from "@/lib/integrationCatalog";

export type ConnectionStatus = "active" | "error" | "disabled";

export interface ConnectionMetadata {
  /** Uses the provider's public demo account instead of stored credentials. */
  demo?: boolean;
  /** Limit discovery to these provider site ids. */
  siteIds?: number[];
  /** Provider account the credentials resolved to, for display. */
  accountName?: string;
  deviceCount?: number;
}

/** Safe to return from the API — no credentials, ever. */
export interface Connection {
  id: string;
  orgId: string;
  provider: IntegrationProviderId;
  label: string;
  status: ConnectionStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  metadata: ConnectionMetadata;
  hasCredentials: boolean;
  createdAt: string;
}

interface StoredConnection extends Connection {
  credentials: string | null;
}

const memory = new Map<string, StoredConnection>();

function fromRow(row: {
  id: string; orgId: string; provider: string; label: string; credentials: string | null;
  status: ConnectionStatus; lastSyncAt: Date | null; lastError: string | null; metadata: unknown; createdAt: Date;
}): StoredConnection {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider as IntegrationProviderId,
    label: row.label,
    status: row.status,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as ConnectionMetadata,
    hasCredentials: Boolean(row.credentials),
    credentials: row.credentials,
    createdAt: row.createdAt.toISOString(),
  };
}

function publicView(c: StoredConnection): Connection {
  const { credentials, ...rest } = c;
  void credentials;
  return rest;
}

async function listStored(orgId: string): Promise<StoredConnection[]> {
  if (!isDbConfigured()) return [...memory.values()].filter((c) => c.orgId === orgId);
  const rows = await getPrisma()!.integrationConnection.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  return rows.map(fromRow);
}

export async function listConnections(orgId: string): Promise<Connection[]> {
  return (await listStored(orgId)).map(publicView);
}

export async function getConnection(orgId: string, id: string): Promise<Connection | undefined> {
  const c = (await listStored(orgId)).find((x) => x.id === id);
  return c ? publicView(c) : undefined;
}

/** Every active connection across all orgs — for the scheduled sync. */
export async function listAllActiveConnections(): Promise<Connection[]> {
  if (!isDbConfigured()) return [...memory.values()].filter((c) => c.status !== "disabled").map(publicView);
  const rows = await getPrisma()!.integrationConnection.findMany({ where: { status: { not: "disabled" } } });
  return rows.map((r) => publicView(fromRow(r)));
}

export async function createConnection(
  orgId: string,
  input: { provider: IntegrationProviderId; label: string; secret?: string | null; metadata?: ConnectionMetadata },
): Promise<Connection> {
  const credentials = input.secret ? encryptSecret(input.secret) : null;
  const now = new Date();
  if (!isDbConfigured()) {
    const c: StoredConnection = {
      id: randomUUID(), orgId, provider: input.provider, label: input.label, status: "active",
      lastSyncAt: null, lastError: null, metadata: input.metadata ?? {}, hasCredentials: Boolean(credentials),
      credentials, createdAt: now.toISOString(),
    };
    memory.set(c.id, c);
    return publicView(c);
  }
  const row = await getPrisma()!.integrationConnection.create({
    data: {
      orgId, provider: input.provider, label: input.label, credentials,
      metadata: (input.metadata ?? {}) as object,
    },
  });
  return publicView(fromRow(row));
}

/** The decrypted secret for a connection, for its connector only. */
export async function connectionSecret(orgId: string, id: string): Promise<string | null> {
  const c = (await listStored(orgId)).find((x) => x.id === id);
  return c?.credentials ? decryptSecret(c.credentials) : null;
}

export async function recordSync(
  orgId: string, id: string,
  result: { ok: true; deviceCount: number; accountName?: string } | { ok: false; error: string },
): Promise<void> {
  const now = new Date();
  const patch = result.ok
    ? { status: "active" as const, lastError: null, lastSyncAt: now }
    : { status: "error" as const, lastError: result.error.slice(0, 500) };
  if (!isDbConfigured()) {
    const c = memory.get(id);
    if (!c || c.orgId !== orgId) return;
    Object.assign(c, {
      status: patch.status, lastError: patch.lastError,
      ...(result.ok ? { lastSyncAt: now.toISOString(), metadata: { ...c.metadata, deviceCount: result.deviceCount, ...(result.accountName ? { accountName: result.accountName } : {}) } } : {}),
    });
    return;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.integrationConnection.findUnique({ where: { id } });
  if (!existing || existing.orgId !== orgId) return;
  const meta = (existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}) as ConnectionMetadata;
  await prisma.integrationConnection.update({
    where: { id },
    data: {
      ...patch,
      ...(result.ok ? { metadata: { ...meta, deviceCount: result.deviceCount, ...(result.accountName ? { accountName: result.accountName } : {}) } as object } : {}),
    },
  });
}

export async function deleteConnection(orgId: string, id: string): Promise<boolean> {
  if (!isDbConfigured()) {
    const c = memory.get(id);
    if (!c || c.orgId !== orgId) return false;
    memory.delete(id);
    return true;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.integrationConnection.findUnique({ where: { id } });
  if (!existing || existing.orgId !== orgId) return false;
  await prisma.integrationConnection.delete({ where: { id } });
  return true;
}
