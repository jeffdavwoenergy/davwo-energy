import { describe, it, expect } from "vitest";
import { POST as link } from "@/app/api/membership/link/route";
import { POST as switchPlatform } from "@/app/api/membership/switch/route";
import { GET as membership } from "@/app/api/membership/route";
import { GET as accounts } from "@/app/api/membership/accounts/route";
import { signToken, signSupplierToken } from "@/lib/server/jwt";
import { createUser } from "@/lib/server/users";
import { registerSupplier } from "@/lib/server/suppliers";

const req = (url: string, token: string, body?: object) =>
  new Request(`http://x/api/${url}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

async function newPair(email: string) {
  const user = await createUser("davwo", email, "Pat", "operator", "password123");
  const supplier = await registerSupplier({ email, password: "password123", companyName: "Pat Co", category: "solar" });
  const aniToken = await signToken({ sub: user.id, email, role: "operator", org: "davwo" });
  const supplierToken = await signSupplierToken({ sub: supplier.id, email });
  return { user, supplier, aniToken, supplierToken };
}

describe("account links + instant platform switching", () => {
  it("demo admins are pre-linked and switch both ways without signing in", async () => {
    const acmeAni = await signToken({ sub: "u-acme-admin", email: "admin@acmecorp.com", role: "admin", org: "acme" });
    const toSupplier = await switchPlatform(req("membership/switch", acmeAni, { to: "supplier" }));
    expect(toSupplier.status).toBe(200);
    const { token: supToken, supplier } = await toSupplier.json();
    expect(supplier).toMatchObject({ id: "s-acme", companyName: "Acme Corp" });

    const back = await switchPlatform(req("membership/switch", supToken, { to: "ani" }));
    expect(back.status).toBe(200);
    expect((await back.json()).user).toMatchObject({ id: "u-acme-admin", orgName: "Acme Corp" });

    expect(await (await membership(req("membership", acmeAni))).json()).toMatchObject({ tier: "full", linked: true });
  });

  it("matching emails alone do NOT allow a switch — the accounts must be linked first", async () => {
    const { aniToken, supplierToken } = await newPair(`pat-${Math.random()}@co.example`);
    expect((await switchPlatform(req("membership/switch", supplierToken, { to: "ani" }))).status).toBe(409);
    expect(await (await membership(req("membership", aniToken))).json()).toMatchObject({ tier: "full", linked: false });

    // Proving both sessions links them; then the switch works.
    const linked = await link(new Request("http://x/api/membership/link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aniToken, supplierToken }),
    }));
    expect(linked.status).toBe(200);
    expect((await switchPlatform(req("membership/switch", supplierToken, { to: "ani" }))).status).toBe(200);
    expect((await switchPlatform(req("membership/switch", aniToken, { to: "supplier" }))).status).toBe(200);
  });

  it("refuses to link accounts with different emails or without both valid sessions", async () => {
    const a = await newPair(`a-${Math.random()}@co.example`);
    const b = await newPair(`b-${Math.random()}@co.example`);
    const post = (body: object) => link(new Request("http://x/api/membership/link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    expect((await post({ aniToken: a.aniToken, supplierToken: b.supplierToken })).status).toBe(400);
    expect((await post({ aniToken: a.aniToken, supplierToken: "forged" })).status).toBe(400);
    expect((await switchPlatform(req("membership/switch", a.aniToken, { to: "supplier" }))).status).toBe(409);
  });

  it("rejects a switch with the wrong kind of token or a bad target", async () => {
    const acmeAni = await signToken({ sub: "u-acme-admin", email: "admin@acmecorp.com", role: "admin", org: "acme" });
    expect((await switchPlatform(req("membership/switch", acmeAni, { to: "ani" }))).status).toBe(401); // needs a supplier token
    expect((await switchPlatform(req("membership/switch", acmeAni, { to: "elsewhere" }))).status).toBe(400);
  });

  it("combined settings data: both sides for linked accounts, only your own side otherwise", async () => {
    const davwoSupplier = await signSupplierToken({ sub: "s-davwo", email: "admin@davwo.com" });
    const both = await (await accounts(req("membership/accounts", davwoSupplier))).json();
    expect(both.current).toBe("supplier");
    expect(both.supplier).toMatchObject({ companyName: "Davwo Energy Ltd" });
    expect(both.ani.user).toMatchObject({ email: "admin@davwo.com", orgName: "Davwo Energy" });
    expect(both.ani.org).toMatchObject({ name: "Davwo Energy", plan: "enterprise" });
    expect(both.ani.team.length).toBeGreaterThan(0);
    expect(JSON.stringify(both)).not.toContain("passwordHash");

    // Same email on both platforms but NOT linked → the other side stays hidden.
    const { supplierToken } = await newPair(`unlinked-${Math.random()}@co.example`);
    const mine = await (await accounts(req("membership/accounts", supplierToken))).json();
    expect(mine.supplier).toBeTruthy();
    expect(mine.ani).toBeNull();
  });
});
