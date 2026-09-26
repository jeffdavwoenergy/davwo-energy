import { describe, it, expect } from "vitest";
import { signup } from "@/lib/server/signup";
import { EmailInUseError, findByEmail } from "@/lib/server/users";
import { verifyToken } from "@/lib/server/jwt";
import { tenantSeed } from "@/lib/server/tenants";

describe("signup (in-memory fallback)", () => {
  it("provisions a new org + admin user in one step, with a working token and a distinct seed", async () => {
    const email = `founder-${Math.random()}@newco.example`;
    const result = await signup({ orgName: "New Co Energy", region: "Leeds", name: "Founder", email, password: "correct-horse-1" });

    expect(result.user.role).toBe("admin");
    expect(result.user.orgName).toBe("New Co Energy");
    expect(result.user.orgId).toMatch(/^org-/);

    const claims = await verifyToken(result.token);
    expect(claims.org).toBe(result.user.orgId);
    expect(claims.role).toBe("admin");

    // A brand-new org gets its own distinct synthetic-network seed, not "davwo"'s.
    expect(tenantSeed(result.user.orgId)).not.toBe(42);

    // The account is real and findable — the whole point of this feature.
    expect((await findByEmail(email))?.orgId).toBe(result.user.orgId);
  });

  it("rejects signing up with an email that's already registered", async () => {
    const email = `dup-${Math.random()}@newco.example`;
    await signup({ orgName: "Org A", name: "A", email, password: "correct-horse-1" });
    await expect(
      signup({ orgName: "Org B", name: "B", email, password: "correct-horse-2" }),
    ).rejects.toThrow(EmailInUseError);
  });
});
