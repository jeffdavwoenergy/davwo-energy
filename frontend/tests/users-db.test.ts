import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

function fakeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", {
    code: "P2002",
    clientVersion: "test",
  });
}

/**
 * Exercises users.ts's Postgres-backed branch against a fake Prisma client
 * (count/createMany/findUnique/findFirst/findMany/create/update on a plain
 * array) rather than a live database — see MVP_BUILD_PLAN.md Phase G for why
 * a real Supabase integration test isn't wired into CI yet (no DATABASE_URL
 * available; a real Postgres instance would add CI fragility for a client
 * call sequence that's a few lines of documented boilerplate). Sign-off
 * pending a real DATABASE_URL.
 */
const store: Record<string, unknown>[] = [];

function makeFakeUserModel() {
  return {
    count: async (args?: { where?: Record<string, unknown> }) => {
      if (!args?.where) return store.length;
      return store.filter((d) => Object.entries(args.where!).every(([k, v]) => d[k] === v)).length;
    },
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      store.push(...data);
      return { count: data.length };
    },
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const [key, value] = Object.entries(where)[0];
      return store.find((d) => d[key] === value) ?? null;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      store.find((d) => Object.entries(where).every(([k, v]) => d[k] === v)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      store.filter((d) => Object.entries(where).every(([k, v]) => d[k] === v)),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      // Real unique-constraint enforcement, so a genuine concurrent-insert
      // race (both callers pass the pre-check before either inserts) is
      // reproducible here exactly as Postgres would reject it.
      if (store.some((d) => d.email === data.email)) throw fakeUniqueConstraintError();
      // Simulates a transient DB failure unrelated to email uniqueness —
      // createUser/inviteUser must let this propagate as-is, not mask it as EmailInUseError.
      if (data.name === "__trigger_db_error__") throw new Error("connection reset");
      store.push(data);
      return data;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const doc = store.find((d) => d.id === where.id);
      if (!doc) throw new Error("Record to update not found.");
      Object.assign(doc, data);
      return doc;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const idx = store.findIndex((d) => d.id === where.id);
      if (idx < 0) throw new Error("Record to delete does not exist.");
      const [removed] = store.splice(idx, 1);
      return removed;
    },
  };
}

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  // createUser's publicUser() call resolves the tenant, which falls through to
  // orgs.ts's findOrg() for any non-static orgId (e.g. "org-new" below) — give
  // it a stub so that lookup resolves to "not found" instead of crashing.
  getPrisma: () => ({
    user: makeFakeUserModel(),
    org: { findUnique: async () => null },
    // updatePreferences' atomic JSONB-merge query — not a general raw-SQL
    // interpreter, just enough to replicate the one query shape it issues.
    $queryRaw: async (_strings: TemplateStringsArray, defaultsJson: string, updatesJson: string, userId: string) => {
      const doc = store.find((d) => d.id === userId);
      if (!doc) return [];
      const base = (doc.preferences as Record<string, unknown> | undefined) ?? JSON.parse(defaultsJson);
      doc.preferences = { ...base, ...JSON.parse(updatesJson) };
      return [{ preferences: doc.preferences }];
    },
  }),
}));

describe("users (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("seeds bcrypt-hashed demo users on first lookup and finds them by email/role/id", async () => {
    const { findByEmail, findByRole, findById, checkPassword, DEMO_USERS } = await import(
      "@/lib/server/users"
    );

    const admin = await findByEmail("admin@davwo.com");
    expect(admin).toBeDefined();
    expect((admin as { passwordHash?: string }).passwordHash).toBeDefined();
    expect((admin as { passwordHash: string }).passwordHash).not.toBe(DEMO_USERS[0].password);
    expect(await checkPassword(admin!, DEMO_USERS[0].password)).toBe(true);
    expect(await checkPassword(admin!, "wrong")).toBe(false);

    expect((await findByRole("operator"))?.orgId).toBe("davwo");
    expect((await findById("u-pilot"))?.orgId).toBe("pilot-mcr");
    expect(await findByEmail("nobody@x.com")).toBeUndefined();

    // Simulate a role/id absent from the collection (all 3 demo roles are seeded, so
    // remove one to exercise the "not found" branch of the Postgres-backed lookups too.
    const pilotIndex = store.findIndex((d) => d.role === "pilot");
    store.splice(pilotIndex, 1);
    expect(await findByRole("pilot")).toBeUndefined();
    expect(await findById("u-pilot")).toBeUndefined();
  });

  it("does not seed when another instance already populated the collection before this one's first lookup", async () => {
    // Simulates a cold-started serverless instance: its local `seeded` flag
    // starts false, but the DB already has rows from a prior instance's seed.
    store.push({ id: "u-existing", email: "already-here@davwo.com", name: "Existing", role: "admin", orgId: "davwo", passwordHash: "x" });
    const { findByEmail } = await import("@/lib/server/users");
    expect(await findByEmail("already-here@davwo.com")).toBeDefined();
    expect(store).toHaveLength(1); // DEMO_USERS were NOT inserted on top
  });

  it("does not re-seed once the collection is already populated", async () => {
    const { findByEmail } = await import("@/lib/server/users");
    await findByEmail("admin@davwo.com");
    const countAfterFirstLookup = store.length;
    await findByEmail("operator@davwo.com");
    expect(store.length).toBe(countAfterFirstLookup);
  });

  it("listOrgUsers scopes to the org and excludes secrets", async () => {
    const { listOrgUsers, findByEmail } = await import("@/lib/server/users");
    await findByEmail("admin@davwo.com"); // triggers seed
    const davwoUsers = await listOrgUsers("davwo");
    expect(davwoUsers.map((u) => u.email).sort()).toEqual(["admin@davwo.com", "operator@davwo.com"]);
    expect(davwoUsers.every((u) => !("passwordHash" in u))).toBe(true);
    expect(await listOrgUsers("pilot-mcr")).toHaveLength(1);
  });

  it("inviteUser creates a new user and rejects a duplicate email", async () => {
    const { inviteUser, EmailInUseError, listOrgUsers } = await import("@/lib/server/users");
    const invited = await inviteUser("davwo", "new.hire@davwo.com", "New Hire", "operator");
    expect(invited.user.email).toBe("new.hire@davwo.com");
    expect((await listOrgUsers("davwo")).some((u) => u.email === "new.hire@davwo.com")).toBe(true);

    await expect(inviteUser("davwo", "admin@davwo.com", "Dup", "admin")).rejects.toThrow(EmailInUseError);
  });

  it("createUser (self-service signup) persists to the collection and rejects a duplicate email", async () => {
    const { createUser, EmailInUseError, findByEmail, checkPassword } = await import("@/lib/server/users");
    const user = await createUser("org-new", "founder@newco.example", "Founder", "admin", "my-real-password1");
    expect(user.email).toBe("founder@newco.example");
    expect(user.orgId).toBe("org-new");

    const record = await findByEmail("founder@newco.example");
    expect(await checkPassword(record!, "my-real-password1")).toBe(true);

    await expect(
      createUser("org-other", "founder@newco.example", "Someone Else", "admin", "other-password1"),
    ).rejects.toThrow(EmailInUseError);
  });

  it("createUser is race-safe: two concurrent signups for the same email don't both succeed (regression: previously an unhandled 500 instead of EmailInUseError)", async () => {
    const { createUser, EmailInUseError } = await import("@/lib/server/users");
    const email = `racer-${Math.random()}@newco.example`;
    const results = await Promise.allSettled([
      createUser("org-race-a", email, "Racer A", "admin", "password-one1"),
      createUser("org-race-b", email, "Racer B", "admin", "password-two2"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(EmailInUseError);
    expect(store.filter((d) => d.email === email)).toHaveLength(1);
  });

  it("createUser and inviteUser let a non-uniqueness DB error propagate as-is, not masked as EmailInUseError", async () => {
    const { createUser, inviteUser, EmailInUseError } = await import("@/lib/server/users");
    await expect(
      createUser("org-dberr", `dberr-${Math.random()}@newco.example`, "__trigger_db_error__", "admin", "password123"),
    ).rejects.toThrow("connection reset");
    await expect(
      inviteUser("org-dberr", `dberr2-${Math.random()}@newco.example`, "__trigger_db_error__", "operator"),
    ).rejects.toThrow("connection reset");
    // Neither rejection should be the domain-specific EmailInUseError.
    await expect(
      createUser("org-dberr", `dberr3-${Math.random()}@newco.example`, "__trigger_db_error__", "admin", "password123"),
    ).rejects.not.toBeInstanceOf(EmailInUseError);
  });

  it("updateProfile patches name/job_title/company via Prisma", async () => {
    const { updateProfile, findByEmail } = await import("@/lib/server/users");
    await findByEmail("admin@davwo.com"); // triggers seed
    const admin = await findByEmail("admin@davwo.com");
    const updated = await updateProfile(admin!.id, { name: "New Name", job_title: "New Title", company: "New Co" });
    expect(updated.name).toBe("New Name");
    expect(updated.job_title).toBe("New Title");
    expect(updated.company).toBe("New Co");
  });

  it("getPreferences/updatePreferences round-trip via Prisma, defaulting when unset", async () => {
    const { getPreferences, updatePreferences, findByEmail } = await import("@/lib/server/users");
    await findByEmail("admin@davwo.com"); // triggers seed
    const admin = await findByEmail("admin@davwo.com");

    expect(await getPreferences(admin!.id)).toEqual({ liveData: true, emailAlerts: true, autoOptimise: false });

    const updated = await updatePreferences(admin!.id, { autoOptimise: true });
    expect(updated).toEqual({ liveData: true, emailAlerts: true, autoOptimise: true });
    expect(await getPreferences(admin!.id)).toEqual(updated);
  });

  it("updateUserRole changes a teammate's role, guarded against demo accounts, self, and the last admin", async () => {
    const {
      updateUserRole, inviteUser, findByEmail, DemoAccountActionError, SelfActionError, LastAdminError,
    } = await import("@/lib/server/users");
    await findByEmail("admin@davwo.com"); // triggers seed
    const admin = await findByEmail("admin@davwo.com");

    // A demo seed account can never be reassigned, even by a real admin.
    await expect(updateUserRole("davwo", admin!.id, "u-operator", "admin")).rejects.toThrow(DemoAccountActionError);

    // Real (non-seed) accounts from here on, so self/last-admin guards are
    // actually reachable instead of being pre-empted by the demo-account check.
    const { user: soleAdmin } = await inviteUser("org-fresh", "sole-admin@newco.example", "Sole Admin", "admin");
    const { user: viewer } = await inviteUser("org-fresh", "viewer@newco.example", "Viewer", "operator");
    await expect(updateUserRole("org-fresh", soleAdmin.id, soleAdmin.id, "operator")).rejects.toThrow(SelfActionError);
    // A second admin can safely be demoted without tripping the guard.
    const secondAdmin = await updateUserRole("org-fresh", soleAdmin.id, viewer.id, "admin");
    expect(secondAdmin.role).toBe("admin");
    const demoted = await updateUserRole("org-fresh", soleAdmin.id, viewer.id, "operator");
    expect(demoted.role).toBe("operator");
    // Now only soleAdmin is an admin in org-fresh — demoting via a third
    // party acting on soleAdmin should be blocked by LastAdminError.
    const { user: thirdParty } = await inviteUser("org-fresh", "third@newco.example", "Third", "operator");
    await expect(updateUserRole("org-fresh", thirdParty.id, soleAdmin.id, "operator")).rejects.toThrow(LastAdminError);
  });

  it("removeUser deletes a teammate via Prisma, guarded the same way as updateUserRole", async () => {
    const { removeUser, inviteUser, findByEmail, findById, DemoAccountActionError, SelfActionError, UserNotFoundError } = await import(
      "@/lib/server/users"
    );
    await findByEmail("admin@davwo.com"); // triggers seed
    const admin = await findByEmail("admin@davwo.com");
    const { user: invited } = await inviteUser("davwo", "removable@davwo.com", "Removable", "operator");
    const { user: secondAdmin } = await inviteUser("davwo", "second-admin@davwo.com", "Second Admin", "admin");

    await expect(removeUser("davwo", admin!.id, "u-operator")).rejects.toThrow(DemoAccountActionError);
    await expect(removeUser("davwo", secondAdmin.id, secondAdmin.id)).rejects.toThrow(SelfActionError);
    await expect(removeUser("davwo", admin!.id, "u-does-not-exist")).rejects.toThrow(UserNotFoundError);

    await removeUser("davwo", admin!.id, invited.id);
    expect(await findById(invited.id)).toBeUndefined();
  });

  it("changePassword rejects the wrong current password and updates on success", async () => {
    const { changePassword, WrongPasswordError, findByEmail, checkPassword, DEMO_USERS } = await import(
      "@/lib/server/users"
    );
    const admin = await findByEmail("admin@davwo.com");

    await expect(changePassword(admin!.id, "totally-wrong", "newSecurePass123")).rejects.toThrow(
      WrongPasswordError,
    );

    await changePassword(admin!.id, DEMO_USERS[0].password, "newSecurePass123");
    const updated = await findByEmail("admin@davwo.com");
    expect(await checkPassword(updated!, "newSecurePass123")).toBe(true);
    expect(await checkPassword(updated!, DEMO_USERS[0].password)).toBe(false);
  });

  it("listUsersWithReportsEnabled finds only subscribers across every org, via Prisma", async () => {
    const { inviteUser, updatePreferences, listUsersWithReportsEnabled } = await import("@/lib/server/users");
    const { user: subscriber } = await inviteUser("org-reports-a", "subscriber@newco.example", "Subscriber", "admin");
    const { user: notSubscribed } = await inviteUser("org-reports-b", "not-subscribed@newco.example", "Not Subscribed", "admin");
    await updatePreferences(subscriber.id, { reportSchedule: { enabled: true, period: "weekly", category: "energy" } });
    await updatePreferences(notSubscribed.id, { reportSchedule: { enabled: false, period: "daily", category: "asset" } });

    const subscribers = await listUsersWithReportsEnabled();
    expect(subscribers.map((s) => s.user.id)).toContain(subscriber.id);
    expect(subscribers.map((s) => s.user.id)).not.toContain(notSubscribed.id);
    const found = subscribers.find((s) => s.user.id === subscriber.id);
    expect(found?.schedule).toEqual({ enabled: true, period: "weekly", category: "energy" });
  });
});
