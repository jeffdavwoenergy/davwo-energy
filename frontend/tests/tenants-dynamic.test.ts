import { describe, it, expect, vi, beforeEach } from "vitest";

const orgs = new Map<string, { id: string; name: string; slug: string; region?: string }>();

vi.mock("@/lib/server/orgs", () => ({
  findOrg: async (id: string) => orgs.get(id),
}));

describe("tenants — dynamic org resolution", () => {
  beforeEach(() => {
    orgs.clear();
    vi.resetModules();
  });

  it("hashSeed is deterministic and stays clear of the static demo seeds", async () => {
    const { hashSeed } = await import("@/lib/server/tenants");
    expect(hashSeed("org-abc")).toBe(hashSeed("org-abc"));
    expect(hashSeed("org-abc")).not.toBe(hashSeed("org-xyz"));
    for (const id of ["a", "org-abc", "a-very-long-organisation-id-string"]) {
      const s = hashSeed(id);
      expect(s).toBeGreaterThanOrEqual(100);
      expect(s).toBeLessThan(1000);
      expect([7, 42, 99]).not.toContain(s);
    }
  });

  it("resolveTenant: null/undefined id falls back to the default tenant", async () => {
    const { resolveTenant, TENANTS } = await import("@/lib/server/tenants");
    expect((await resolveTenant(null)).id).toBe(TENANTS[0].id);
    expect((await resolveTenant(undefined)).id).toBe(TENANTS[0].id);
  });

  it("resolveTenant: a found dynamic org resolves to its real name/region, hash-seeded", async () => {
    orgs.set("org-1", { id: "org-1", name: "Riverbank Energy", slug: "riverbank-energy-ab12cd", region: "Bristol" });
    const { resolveTenant, hashSeed } = await import("@/lib/server/tenants");
    const t = await resolveTenant("org-1");
    expect(t).toEqual({ id: "org-1", name: "Riverbank Energy", slug: "riverbank-energy-ab12cd", seed: hashSeed("org-1"), plan: "pilot", region: "Bristol" });
  });

  it("resolveTenant: an unrecognised id (not static, not found) never becomes 'davwo'", async () => {
    const { resolveTenant } = await import("@/lib/server/tenants");
    const t = await resolveTenant("org-ghost");
    expect(t.id).toBe("org-ghost");
    expect(t.name).toBe("org-ghost"); // honest fallback, not a false "Davwo Energy"
  });

  it("tenantSeed: null id and unknown id both resolve without throwing", async () => {
    const { tenantSeed, hashSeed } = await import("@/lib/server/tenants");
    expect(tenantSeed(null)).toBe(42);
    expect(tenantSeed("org-not-static")).toBe(hashSeed("org-not-static"));
  });

  it("tenantsForUser: a dynamic org's admin sees only their own org (not the 3 demo tenants)", async () => {
    orgs.set("org-2", { id: "org-2", name: "New Co", slug: "new-co-xy" });
    const { tenantsForUser } = await import("@/lib/server/tenants");
    const list = await tenantsForUser("admin", "org-2");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("New Co");
  });
});
