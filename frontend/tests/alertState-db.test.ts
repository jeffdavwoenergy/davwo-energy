import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    alertState: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        store.filter((d) => Object.entries(where).every(([k, v]) => d[k] === v)),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { orgId_alertId: { orgId: string; alertId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const { orgId, alertId } = where.orgId_alertId;
        const idx = store.findIndex((d) => d.orgId === orgId && d.alertId === alertId);
        if (idx >= 0) store[idx] = { ...store[idx], ...update };
        else store.push(create);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // Mirrors the real (orgId, alertId) primary key constraint.
        if (store.some((d) => d.orgId === data.orgId && d.alertId === data.alertId)) {
          throw new Error("Unique constraint failed on the fields: (`orgId`,`alertId`)");
        }
        store.push(data);
        return data;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = store.filter((d) => Object.entries(where).every(([k, v]) => d[k] === v));
        matches.forEach((d) => Object.assign(d, data));
        return { count: matches.length };
      },
    },
  }),
}));

describe("alertState (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("upserts state and reads it back scoped to the org", async () => {
    const { getAlertStates, setAlertState } = await import("@/lib/server/alertState");

    expect((await getAlertStates("org-x")).size).toBe(0);

    await setAlertState("org-x", "al-1", "acknowledged");
    const states = await getAlertStates("org-x");
    expect(states.get("al-1")?.status).toBe("acknowledged");
    expect(states.get("al-1")?.acknowledged_at).toBeDefined();

    // Second write to the same (org, alert) upserts in place, not a duplicate.
    await setAlertState("org-x", "al-1", "resolved");
    expect(store.length).toBe(1);
    expect((await getAlertStates("org-x")).get("al-1")?.status).toBe("resolved");

    // A different org sees nothing for that alert.
    expect((await getAlertStates("org-y")).size).toBe(0);
  });

  it("claimAlertState: first claim wins, a concurrent second claim on the same active row loses, via Prisma", async () => {
    const { claimAlertState, getAlertStates } = await import("@/lib/server/alertState");

    const first = await claimAlertState("org-x", "al-race", "active");
    const second = await claimAlertState("org-x", "al-race", "active");
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(store).toHaveLength(1); // no duplicate row from the losing claim
    expect((await getAlertStates("org-x")).get("al-race")?.status).toBe("active");
  });

  it("claimAlertState stamps acknowledged_at/resolved_at when claiming directly into those statuses, via Prisma", async () => {
    const { claimAlertState, getAlertStates } = await import("@/lib/server/alertState");
    await claimAlertState("org-x", "al-ack", "acknowledged");
    await claimAlertState("org-x", "al-res", "resolved");
    const states = await getAlertStates("org-x");
    expect(states.get("al-ack")?.acknowledged_at).toBeDefined();
    expect(states.get("al-res")?.resolved_at).toBeDefined();
  });

  it("claimAlertState re-claims a resolved row (fresh occurrence after recovery), via Prisma", async () => {
    const { claimAlertState, setAlertState } = await import("@/lib/server/alertState");

    await claimAlertState("org-x", "al-recover", "active");
    await setAlertState("org-x", "al-recover", "resolved");

    const reclaimed = await claimAlertState("org-x", "al-recover", "active");
    expect(reclaimed).toBe(true);
    expect(store).toHaveLength(1);
  });
});
