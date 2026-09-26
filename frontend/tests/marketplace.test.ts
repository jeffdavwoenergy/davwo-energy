import { describe, it, expect } from "vitest";
import {
  listVendors, getVendor, resolveVendor, saveLead, listLeadsForVendor, listLeadsForOrg,
  respondToLead, decideLead, LeadNotFoundError, InvalidLeadTransitionError, CATEGORIES, type Lead,
} from "@/lib/server/marketplace";
import { registerSupplier } from "@/lib/server/suppliers";
import { isDbConfigured } from "@/lib/server/prisma";

describe("marketplace catalogue", () => {
  it("lists all vendors with no filter and filters by a known category", () => {
    const all = listVendors();
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBe(new Set(all.map((v) => v.id)).size); // unique ids

    const solar = listVendors("solar");
    expect(solar.length).toBeGreaterThan(0);
    expect(solar.every((v) => v.category === "solar")).toBe(true);
    expect(solar.length).toBeLessThan(all.length);
  });

  it("ignores an unknown category filter and returns everything", () => {
    expect(listVendors("not-a-real-category")).toEqual(listVendors());
  });

  it("every category in CATEGORIES has at least one vendor", () => {
    for (const c of CATEGORIES) {
      expect(listVendors(c.id).length).toBeGreaterThan(0);
    }
  });

  it("looks up a vendor by id", () => {
    const first = listVendors()[0];
    expect(getVendor(first.id)?.name).toBe(first.name);
    expect(getVendor("does-not-exist")).toBeUndefined();
  });
});

describe("resolveVendor (static + dynamic suppliers)", () => {
  it("resolves a static vendor without touching the supplier store", async () => {
    const first = listVendors()[0];
    expect((await resolveVendor(first.id))?.name).toBe(first.name);
  });

  it("resolves a real registered supplier, with sensible defaults for curated-only fields", async () => {
    const supplier = await registerSupplier({
      email: `vendor-${Math.random()}@newco.example`, password: "password123",
      companyName: "Northbridge Storage Co", category: "battery", region: "Leeds, UK",
    });
    const resolved = await resolveVendor(supplier.id);
    expect(resolved?.name).toBe("Northbridge Storage Co");
    expect(resolved?.category).toBe("battery");
    expect(resolved?.region).toBe("Leeds, UK");
    expect(resolved?.verified).toBe(false);
    expect(resolved?.logo_initials).toBe("NS");
  });

  it("returns undefined for an id that's neither a static vendor nor a real supplier", async () => {
    expect(await resolveVendor("not-a-real-vendor-or-supplier")).toBeUndefined();
  });
});

describe("saveLead / listLeadsForVendor (no DB configured)", () => {
  it("saveLead returns false (not persisted to a real DB) but the lead is still readable back via listLeadsForVendor", async () => {
    expect(isDbConfigured()).toBe(false);
    const vendorId = `vendor-leads-${Math.random()}`;
    const persisted = await saveLead({
      vendorId,
      name: "Test User",
      email: "test@example.com",
      message: "Interested in a quote.",
      orgId: "davwo",
      userId: "u-admin",
    });
    expect(persisted).toBe(false);

    await new Promise((r) => setTimeout(r, 2));
    await saveLead({ vendorId, name: "Second User", email: "second@example.com", message: "Also interested.", orgId: "davwo", userId: "u-admin" });

    // Two leads for the same vendor exercises the newest-first sort comparator.
    const leads = await listLeadsForVendor(vendorId);
    expect(leads).toHaveLength(2);
    expect(leads[0].name).toBe("Second User");
    expect(leads[1].name).toBe("Test User");
    expect(leads[0].id).toBeTruthy();
    expect(leads[0].createdAt).toBeTruthy();

    expect(await listLeadsForVendor(`vendor-other-${Math.random()}`)).toEqual([]);
    expect(leads[0].status).toBe("new");
  });
});

describe("procurement workflow: listLeadsForOrg / respondToLead / decideLead (no DB configured)", () => {
  it("listLeadsForOrg is the buyer-side mirror of listLeadsForVendor, newest-first, isolated per org", async () => {
    const org = `org-leads-${Math.random()}`;
    const vendorId = `vendor-${Math.random()}`;
    await saveLead({ vendorId, name: "First Enquiry", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    await new Promise((r) => setTimeout(r, 2));
    await saveLead({ vendorId, name: "Second Enquiry", email: "buyer@example.com", message: "Another one.", orgId: org, userId: "u-admin" });

    const leads = await listLeadsForOrg(org);
    expect(leads).toHaveLength(2);
    expect(leads[0].name).toBe("Second Enquiry");
    expect(leads[1].name).toBe("First Enquiry");
    expect(leads[0].status).toBe("new");
    expect(await listLeadsForOrg(`org-other-${Math.random()}`)).toEqual([]);
  });

  it("the full state machine: new -> responded (supplier) -> accepted (buyer)", async () => {
    const org = `org-flow-${Math.random()}`;
    const vendorId = `vendor-flow-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    const responded = await respondToLead(vendorId, leadId, "Happy to help — £5k installed.");
    expect(responded.status).toBe("responded");
    expect(responded.response).toBe("Happy to help — £5k installed.");
    expect(responded.respondedAt).toBeTruthy();

    const accepted = await decideLead(org, leadId, "accepted");
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedAt).toBeTruthy();

    // Both sides see the final state.
    expect((await listLeadsForVendor(vendorId))[0].status).toBe("accepted");
    expect((await listLeadsForOrg(org))[0].status).toBe("accepted");
  });

  it("declined is a valid terminal state too", async () => {
    const org = `org-decline-${Math.random()}`;
    const vendorId = `vendor-decline-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await respondToLead(vendorId, leadId, "£9k installed.");
    const declined = await decideLead(org, leadId, "declined");
    expect(declined.status).toBe("declined");
  });

  it("respondToLead rejects reopening a lead the buyer has already decided (regression: a supplier could previously revert a decided lead back to 'responded')", async () => {
    const org = `org-reopen-${Math.random()}`;
    const vendorId = `vendor-reopen-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await respondToLead(vendorId, leadId, "£5k installed.");
    await decideLead(org, leadId, "accepted");

    await expect(respondToLead(vendorId, leadId, "Actually, £6k now.")).rejects.toThrow(InvalidLeadTransitionError);
    // The decided state is untouched.
    expect((await listLeadsForOrg(org))[0]).toMatchObject({ status: "accepted", response: "£5k installed." });
  });

  it("respondToLead may revise a response before the buyer decides (responded -> responded is a valid transition)", async () => {
    const org = `org-revise-${Math.random()}`;
    const vendorId = `vendor-revise-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await respondToLead(vendorId, leadId, "£5k installed.");
    const revised = await respondToLead(vendorId, leadId, "Correction: £4.5k installed.");
    expect(revised.status).toBe("responded");
    expect(revised.response).toBe("Correction: £4.5k installed.");
  });

  it("listLeadsForOrg resolves each lead's vendor display name", async () => {
    const org = `org-vendorname-${Math.random()}`;
    const [firstVendor] = listVendors();
    await saveLead({ vendorId: firstVendor.id, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });

    const leads = await listLeadsForOrg(org);
    expect(leads[0].vendorName).toBe(firstVendor.name);
  });

  it("respondToLead rejects an unknown lead id or one belonging to a different vendor", async () => {
    const org = `org-guard-${Math.random()}`;
    const vendorId = `vendor-guard-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await expect(respondToLead("not-the-real-vendor", leadId, "Hi")).rejects.toThrow(LeadNotFoundError);
    await expect(respondToLead(vendorId, "not-a-real-lead-id", "Hi")).rejects.toThrow(LeadNotFoundError);
  });

  it("decideLead rejects an unknown lead, a different org, and a decision before any response", async () => {
    const org = `org-guard2-${Math.random()}`;
    const vendorId = `vendor-guard2-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;

    await expect(decideLead(org, "not-a-real-lead-id", "accepted")).rejects.toThrow(LeadNotFoundError);
    await expect(decideLead("not-the-real-org", leadId, "accepted")).rejects.toThrow(LeadNotFoundError);
    // Still "new" — the supplier hasn't responded yet.
    await expect(decideLead(org, leadId, "accepted")).rejects.toThrow(InvalidLeadTransitionError);
  });

  it("decideLead is race-safe: two concurrent decisions on the same lead don't both win", async () => {
    const org = `org-decide-race-${Math.random()}`;
    const vendorId = `vendor-decide-race-${Math.random()}`;
    await saveLead({ vendorId, name: "Buyer", email: "buyer@example.com", message: "Quote please.", orgId: org, userId: "u-admin" });
    const leadId = (await listLeadsForOrg(org))[0].id;
    await respondToLead(vendorId, leadId, "£5k installed.");

    const results = await Promise.allSettled([
      decideLead(org, leadId, "accepted"),
      decideLead(org, leadId, "declined"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1); // exactly one racing decision wins
    const final = (await listLeadsForOrg(org))[0].status;
    expect(["accepted", "declined"]).toContain(final);
    // The final stored state matches whichever call actually succeeded.
    expect(final).toBe((fulfilled[0] as PromiseFulfilledResult<Lead>).value.status);
  });

});
