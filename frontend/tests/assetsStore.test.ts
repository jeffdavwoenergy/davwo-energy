import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { listUserAssets, addUserAsset, getUserAsset, updateUserAsset, removeUserAsset } from "@/lib/server/assetsStore";

describe("assetsStore (in-memory fallback — no MONGODB_URI configured)", () => {
  it("starts empty and returns what was added, scoped per org", async () => {
    expect(isDbConfigured()).toBe(false);
    const org = `org-${Math.random()}`;
    expect(await listUserAssets(org)).toEqual([]);

    const created = await addUserAsset(org, { name: "Test Battery", type: "Battery", site: "Test Site", capacity_kw: 100 });
    expect(created.id).toMatch(/^ua-/);
    expect(created.status).toBe("healthy");
    expect(created.source).toBe("user");

    const list = await listUserAssets(org);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Test Battery");

    expect(await listUserAssets(`org-other-${Math.random()}`)).toEqual([]);
  });

  it("addUserAsset persists technical info + product link, and getUserAsset finds it back", async () => {
    const org = `org-${Math.random()}`;
    const created = await addUserAsset(org, {
      name: "Rapid 50", type: "EV Charger", site: "Depot", capacity_kw: 50,
      manufacturer: "Voltway", model: "Rapid 50", serial_number: "SN-123",
      installed_at: "2026-01-15", product_id: "prod-1",
    });
    expect(created.manufacturer).toBe("Voltway");
    expect(created.product_id).toBe("prod-1");

    const found = await getUserAsset(org, created.id);
    expect(found?.serial_number).toBe("SN-123");
    expect(await getUserAsset(org, "ua-unknown")).toBeUndefined();
    expect(await getUserAsset(`org-other-${Math.random()}`, created.id)).toBeUndefined();
  });

  it("updateUserAsset patches status/technical fields and returns undefined for an unknown id", async () => {
    const org = `org-${Math.random()}`;
    const created = await addUserAsset(org, { name: "Battery", type: "Battery", site: "Site", capacity_kw: 100 });

    const updated = await updateUserAsset(org, created.id, { status: "degraded", manufacturer: "Northbank", product_id: "prod-2" });
    expect(updated?.status).toBe("degraded");
    expect(updated?.manufacturer).toBe("Northbank");
    expect(updated?.product_id).toBe("prod-2");

    // A second, non-overlapping partial update — exercises the remaining fields' "provided" branch too.
    const updatedAgain = await updateUserAsset(org, created.id, { model: "Mk2", serial_number: "SN-999", installed_at: "2026-02-01" });
    expect(updatedAgain?.model).toBe("Mk2");
    expect(updatedAgain?.serial_number).toBe("SN-999");
    expect(updatedAgain?.installed_at).toBe("2026-02-01");
    // Still carries the first update's fields — a partial patch doesn't clobber the rest.
    expect(updatedAgain?.status).toBe("degraded");

    expect(await updateUserAsset(org, "ua-unknown", { status: "down" })).toBeUndefined();
    expect(await updateUserAsset(`org-other-${Math.random()}`, created.id, { status: "down" })).toBeUndefined();
  });

  it("clears installed_at when patched with an empty string, instead of storing an unparseable value (regression)", async () => {
    const org = `org-${Math.random()}`;
    const created = await addUserAsset(org, { name: "Charger", type: "EV Charger", site: "Site", capacity_kw: 50, installed_at: "2026-01-01" });
    expect(created.installed_at).toBe("2026-01-01");

    const cleared = await updateUserAsset(org, created.id, { installed_at: "" });
    expect(cleared?.installed_at).toBeUndefined();
  });

  it("removeUserAsset deletes the asset and is idempotent-safe against an unknown id", async () => {
    const org = `org-${Math.random()}`;
    const created = await addUserAsset(org, { name: "Solar", type: "Solar", site: "Roof", capacity_kw: 200 });

    expect(await removeUserAsset(org, created.id)).toBe(true);
    expect(await getUserAsset(org, created.id)).toBeUndefined();
    expect(await removeUserAsset(org, created.id)).toBe(false);
    expect(await removeUserAsset(org, "ua-unknown")).toBe(false);
  });
});
