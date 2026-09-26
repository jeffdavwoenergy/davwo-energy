import { getPrisma, isDbConfigured } from "@/lib/server/prisma";

export type AlertStatus = "active" | "acknowledged" | "resolved";

export interface AlertStateRecord {
  status: AlertStatus;
  acknowledged_at?: string;
  resolved_at?: string;
}

/** Per-instance fallback when no DB is configured — same accepted limitation
 * as other module-level state in this codebase (e.g. src/lib/ani/network.ts's
 * cache): resets on cold start, not shared across serverless instances. */
const memoryStates = new Map<string, AlertStateRecord>();
const memKey = (orgId: string, alertId: string) => `${orgId}:${alertId}`;

export async function getAlertStates(orgId: string): Promise<Map<string, AlertStateRecord>> {
  if (!isDbConfigured()) {
    const out = new Map<string, AlertStateRecord>();
    for (const [key, val] of memoryStates) {
      if (key.startsWith(`${orgId}:`)) out.set(key.slice(orgId.length + 1), val);
    }
    return out;
  }
  const prisma = getPrisma()!;
  const docs = await prisma.alertState.findMany({ where: { orgId } });
  return new Map(
    docs.map((d) => [
      d.alertId,
      {
        status: d.status,
        acknowledged_at: d.acknowledgedAt?.toISOString(),
        resolved_at: d.resolvedAt?.toISOString(),
      },
    ]),
  );
}

export async function setAlertState(orgId: string, alertId: string, status: AlertStatus): Promise<void> {
  const record: AlertStateRecord = { status };
  const now = new Date().toISOString();
  if (status === "acknowledged") record.acknowledged_at = now;
  if (status === "resolved") record.resolved_at = now;

  if (!isDbConfigured()) {
    memoryStates.set(memKey(orgId, alertId), record);
    return;
  }
  const prisma = getPrisma()!;
  const data = {
    status,
    acknowledgedAt: record.acknowledged_at ? new Date(record.acknowledged_at) : null,
    resolvedAt: record.resolved_at ? new Date(record.resolved_at) : null,
  };
  await prisma.alertState.upsert({
    where: { orgId_alertId: { orgId, alertId } },
    create: { orgId, alertId, ...data },
    update: data,
  });
}

/** Atomic check-and-claim: transitions (orgId, alertId) to `status` and
 * returns true ONLY for the caller that actually made that transition —
 * concurrent callers racing on the same key (e.g. two open tabs polling the
 * same newly-faulted asset at once) get false. Callers use this to decide
 * "do I own sending the one notification for this occurrence", instead of
 * the read-then-write race a plain getAlertStates()+setAlertState() pair
 * would have. Only meaningful for the not-yet-active / previously-resolved
 * → newly-active transition; use setAlertState for user-driven ack/resolve,
 * which isn't subject to this race. */
export async function claimAlertState(orgId: string, alertId: string, status: AlertStatus): Promise<boolean> {
  const now = new Date().toISOString();
  const record: AlertStateRecord = { status };
  if (status === "acknowledged") record.acknowledged_at = now;
  if (status === "resolved") record.resolved_at = now;

  if (!isDbConfigured()) {
    const key = memKey(orgId, alertId);
    const existing = memoryStates.get(key);
    if (existing && existing.status !== "resolved") return false;
    memoryStates.set(key, record);
    return true;
  }
  const prisma = getPrisma()!;
  const data = {
    status,
    acknowledgedAt: record.acknowledged_at ? new Date(record.acknowledged_at) : null,
    resolvedAt: record.resolved_at ? new Date(record.resolved_at) : null,
  };
  try {
    // No row yet — the PK (orgId, alertId) makes this the atomic claim.
    await prisma.alertState.create({ data: { orgId, alertId, ...data } });
    return true;
  } catch {
    // Row already exists — only claim it if it's currently resolved (a
    // fresh occurrence after recovery), and only one racing caller wins.
    const updated = await prisma.alertState.updateMany({
      where: { orgId, alertId, status: "resolved" },
      data,
    });
    return updated.count > 0;
  }
}
