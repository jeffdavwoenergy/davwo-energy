import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    vendorLead: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `lead-${inserted.length + 1}`, status: "new", response: null,
          respondedAt: null, decidedAt: null, createdAt: new Date(), ...data,
        };
        inserted.push(row);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...inserted]
          .filter((d) => Object.entries(where).every(([k, v]) => d[k] === v))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()),
      findUnique: async ({ where }: { where: { id: string } }) => inserted.find((d) => d.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = inserted.find((d) => d.id === where.id);
        if (!row) throw new Error("Record to update not found.");
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = inserted.filter((d) =>
          Object.entries(where).every(([k, v]) => {
            if (v && typeof v === "object" && "notIn" in (v as object)) {
              return !(v as { notIn: unknown[] }).notIn.includes(d[k]);
            }
            return d[k] === v;
          }),
        );
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      },
    },
  }),
}));

describe("saveLead (Postgres-backed)", () => {
  beforeEach(() => {
    inserted.length = 0;
    vi.resetModules();
  });

  it("persists the lead and reports true", async () => {
    const { saveLead, listVendors } = await import("@/lib/server/marketplace");
    const persisted = await saveLead({
      vendorId: listVendors()[0].id,
      name: "Test User",
      email: "test@example.com",
      message: "Interested in a quote.",
      orgId: "davwo",
      userId: "u-admin",
    });
    expect(persisted).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ name: "Test User", email: "test@example.com" });
  });

  it("listLeadsForVendor reads leads back via Prisma, scoped to the vendor", async () => {
    const { saveLead, listLeadsForVendor, listVendors } = await import("@/lib/server/marketplace");
    const vendorId = listVendors()[0].id;
    await saveLead({ vendorId, name: "A", email: "a@example.com", message: "m1", orgId: "davwo", userId: "u-admin" });
    await saveLead({ vendorId, name: "B", email: "b@example.com", message: "m2", orgId: "davwo", userId: "u-admin" });

    const leads = await listLeadsForVendor(vendorId);
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.vendorId === vendorId)).toBe(true);
    expect(await listLeadsForVendor("some-other-vendor")).toEqual([]);
  });
});

describe("procurement workflow (Postgres-backed)", () => {
  beforeEach(() => {
    inserted.length = 0;
    vi.resetModules();
  });

  it("listLeadsForOrg, respondToLead, decideLead complete the state machine via Prisma", async () => {
    const { saveLead, listLeadsForOrg, listLeadsForVendor, respondToLead, decideLead, listVendors } = await import(
      "@/lib/server/marketplace"
    );
    const vendorId = listVendors()[0].id;
    const org = "org-flow-db";
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });

    const leadId = (await listLeadsForOrg(org))[0].id;
    expect((await listLeadsForOrg(org))[0].status).toBe("new");

    const responded = await respondToLead(vendorId, leadId, "£5k installed.");
    expect(responded.status).toBe("responded");
    expect(responded.response).toBe("£5k installed.");

    const accepted = await decideLead(org, leadId, "accepted");
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedAt).toBeTruthy();
    expect((await listLeadsForVendor(vendorId))[0].status).toBe("accepted");
  });

  it("respondToLead and decideLead reject unknown/mismatched ids and a too-early decision, via Prisma", async () => {
    const { saveLead, listLeadsForOrg, respondToLead, decideLead, LeadNotFoundError, InvalidLeadTransitionError, listVendors } =
      await import("@/lib/server/marketplace");
    const vendorId = listVendors()[0].id;
    const org = "org-guard-db";
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await expect(respondToLead("wrong-vendor", leadId, "Hi")).rejects.toThrow(LeadNotFoundError);
    await expect(respondToLead(vendorId, "not-a-real-id", "Hi")).rejects.toThrow(LeadNotFoundError);
    await expect(decideLead("wrong-org", leadId, "accepted")).rejects.toThrow(LeadNotFoundError);
    await expect(decideLead(org, leadId, "accepted")).rejects.toThrow(InvalidLeadTransitionError);
  });

  it("respondToLead rejects reopening an already-decided lead via the conditional updateMany, via Prisma", async () => {
    const { saveLead, listLeadsForOrg, respondToLead, decideLead, InvalidLeadTransitionError, listVendors } = await import(
      "@/lib/server/marketplace"
    );
    const vendorId = listVendors()[0].id;
    const org = "org-reopen-db";
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await respondToLead(vendorId, leadId, "£5k installed.");
    await decideLead(org, leadId, "accepted");

    await expect(respondToLead(vendorId, leadId, "Actually, £6k now.")).rejects.toThrow(InvalidLeadTransitionError);
    expect((await listLeadsForOrg(org))[0]).toMatchObject({ status: "accepted", response: "£5k installed." });
  });

  it("decideLead's conditional updateMany lets exactly one of two racing decisions win, via Prisma", async () => {
    const { saveLead, listLeadsForOrg, respondToLead, decideLead, listVendors } = await import("@/lib/server/marketplace");
    const vendorId = listVendors()[0].id;
    const org = "org-decide-race-db";
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;
    await respondToLead(vendorId, leadId, "£5k installed.");

    const results = await Promise.allSettled([decideLead(org, leadId, "accepted"), decideLead(org, leadId, "declined")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(["accepted", "declined"]).toContain((await listLeadsForOrg(org))[0].status);
  });
});
