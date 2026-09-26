import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { claimAlertState, getAlertStates } from "@/lib/server/alertState";

describe("alertState.claimAlertState (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("the first claim wins; a second claim on the same not-yet-resolved key loses", async () => {
    const org = `org-claim-${Math.random()}`;
    const first = await claimAlertState(org, "al-1", "active");
    const second = await claimAlertState(org, "al-1", "active");
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await getAlertStates(org)).get("al-1")?.status).toBe("active");
  });

  it("re-claims a resolved key (a fresh occurrence after recovery)", async () => {
    const org = `org-claim-recover-${Math.random()}`;
    await claimAlertState(org, "al-1", "active");
    const states = await getAlertStates(org);
    expect(states.get("al-1")?.status).toBe("active");

    // Simulate recovery, then a fresh fault — same pattern checkAssetFaultAlerts uses.
    const { setAlertState } = await import("@/lib/server/alertState");
    await setAlertState(org, "al-1", "resolved");

    const reclaimed = await claimAlertState(org, "al-1", "active");
    expect(reclaimed).toBe(true);
  });

  it("stamps acknowledged_at/resolved_at when claiming directly into those statuses", async () => {
    const org = `org-claim-stamps-${Math.random()}`;
    await claimAlertState(org, "al-ack", "acknowledged");
    await claimAlertState(org, "al-res", "resolved");
    const states = await getAlertStates(org);
    expect(states.get("al-ack")?.acknowledged_at).toBeDefined();
    expect(states.get("al-res")?.resolved_at).toBeDefined();
  });

  it("claims are isolated per org", async () => {
    const claimed = await claimAlertState("org-a-claim", "al-shared", "active");
    expect(claimed).toBe(true);
    expect(await claimAlertState("org-b-claim", "al-shared", "active")).toBe(true); // different org, no conflict
  });
});
