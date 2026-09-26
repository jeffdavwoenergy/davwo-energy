import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { createOrg, findOrg, updateOrg } from "@/lib/server/orgs";

describe("orgs (in-memory fallback — no MONGODB_URI configured)", () => {
  it("creates an org with a slugified, unique slug and finds it back by id", async () => {
    expect(isDbConfigured()).toBe(false);
    const org = await createOrg("Northbridge Mobility Ltd!", "Manchester, UK");
    expect(org.id).toMatch(/^org-/);
    expect(org.name).toBe("Northbridge Mobility Ltd!");
    expect(org.slug).toMatch(/^northbridge-mobility-ltd-[a-z0-9]{6}$/);
    expect(org.region).toBe("Manchester, UK");
    expect(org.createdAt).toBeTruthy();

    const found = await findOrg(org.id);
    expect(found?.name).toBe(org.name);
  });

  it("returns undefined for an unknown org id", async () => {
    expect(await findOrg("org-does-not-exist")).toBeUndefined();
  });

  it("slugifies a name with no alphanumeric characters to a safe fallback", async () => {
    const org = await createOrg("!!!", undefined);
    expect(org.slug).toMatch(/^org-[a-z0-9]{6}$/);
    expect(org.region).toBeUndefined();
  });

  it("two orgs with the same name get distinct ids and slugs", async () => {
    const a = await createOrg("Duplicate Co");
    const b = await createOrg("Duplicate Co");
    expect(a.id).not.toBe(b.id);
    expect(a.slug).not.toBe(b.slug);
  });

  it("updateOrg patches name/region and is reflected by findOrg", async () => {
    const org = await createOrg("Old Name", "Bristol");
    const updated = await updateOrg(org.id, { name: "New Name", region: "Cardiff" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.region).toBe("Cardiff");
    expect((await findOrg(org.id))?.name).toBe("New Name");
  });

  it("updateOrg on an unknown id returns undefined", async () => {
    expect(await updateOrg("org-does-not-exist", { name: "X" })).toBeUndefined();
  });
});
