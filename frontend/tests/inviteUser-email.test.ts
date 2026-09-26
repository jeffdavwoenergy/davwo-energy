import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/server/email", () => ({
  isEmailConfigured: () => true,
  sendEmail: sendEmailMock,
  emailShell: (title: string, body: string) => `<div>${title}${body}</div>`,
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
}));

describe("inviteUser — email-configured branches", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    vi.resetModules();
  });

  it("delivers the temp password by email and withholds it from the API-facing result", async () => {
    sendEmailMock.mockResolvedValue({ sent: true, id: "em_1" });
    const { inviteUser } = await import("@/lib/server/users");
    const result = await inviteUser("davwo", `sent-${Math.random()}@davwo.com`, "New Hire", "operator");
    expect(result.emailed).toBe(true);
    expect(result.tempPassword).toBeUndefined();
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.html).toContain("New Hire");
  });

  it("falls back to returning the temp password when the send itself fails", async () => {
    sendEmailMock.mockResolvedValue({ sent: false, reason: "provider down" });
    const { inviteUser } = await import("@/lib/server/users");
    const result = await inviteUser("davwo", `failed-${Math.random()}@davwo.com`, "New Hire", "operator");
    expect(result.emailed).toBe(false);
    expect(result.tempPassword).toBeTruthy(); // never a dead-end account
  });
});

describe("createUser (in-memory fallback)", () => {
  it("creates a user with the caller-chosen password, immediately usable to log in", async () => {
    const { createUser } = await import("@/lib/server/users");
    const { checkPassword, findByEmail } = await import("@/lib/server/users");
    const email = `signup-user-${Math.random()}@newco.example`;
    const user = await createUser("org-x", email, "Founder", "admin", "my-real-password1");
    expect(user.email).toBe(email);
    expect(user.role).toBe("admin");

    const record = await findByEmail(email);
    expect(await checkPassword(record!, "my-real-password1")).toBe(true);
    expect(await checkPassword(record!, "wrong")).toBe(false);
  });

  it("rejects a duplicate email", async () => {
    const { createUser, EmailInUseError } = await import("@/lib/server/users");
    const email = `dup-user-${Math.random()}@newco.example`;
    await createUser("org-x", email, "First", "admin", "password123");
    await expect(createUser("org-y", email, "Second", "admin", "password456")).rejects.toThrow(EmailInUseError);
  });

  it("updateProfile patches the in-memory record and is visible to subsequent lookups", async () => {
    const { createUser, updateProfile, findByEmail } = await import("@/lib/server/users");
    const email = `profile-${Math.random()}@newco.example`;
    const user = await createUser("org-x", email, "Original Name", "admin", "password123");
    const updated = await updateProfile(user.id, { name: "Updated Name", job_title: "Founder" });
    expect(updated.name).toBe("Updated Name");
    expect(updated.job_title).toBe("Founder");
    expect((await findByEmail(email))?.name).toBe("Updated Name");
  });

  it("getPreferences/updatePreferences round-trip in-memory, defaulting when unset", async () => {
    const { createUser, getPreferences, updatePreferences } = await import("@/lib/server/users");
    const user = await createUser("org-x", `prefs-${Math.random()}@newco.example`, "Pref User", "admin", "password123");

    expect(await getPreferences(user.id)).toEqual({ liveData: true, emailAlerts: true, autoOptimise: false });

    const updated = await updatePreferences(user.id, { emailAlerts: false });
    expect(updated).toEqual({ liveData: true, emailAlerts: false, autoOptimise: false });
    expect(await getPreferences(user.id)).toEqual(updated);
  });
});

describe("team management (in-memory fallback)", () => {
  it("updateUserRole changes an invited user's role, guarded against self-action and the last admin", async () => {
    const { createUser, updateUserRole, SelfActionError, LastAdminError } = await import("@/lib/server/users");
    const org = `org-team-${Math.random()}`;
    const admin = await createUser(org, `admin-${Math.random()}@newco.example`, "Admin One", "admin", "password123");
    const teammate = await createUser(org, `mate-${Math.random()}@newco.example`, "Teammate", "operator", "password123");

    await expect(updateUserRole(org, admin.id, admin.id, "operator")).rejects.toThrow(SelfActionError);

    const promoted = await updateUserRole(org, admin.id, teammate.id, "admin");
    expect(promoted.role).toBe("admin");

    // Two admins now — demoting one is fine.
    const demoted = await updateUserRole(org, admin.id, teammate.id, "operator");
    expect(demoted.role).toBe("operator");

    // Back to a single admin — a third party can't demote the last one.
    const thirdParty = await createUser(org, `third-${Math.random()}@newco.example`, "Third", "operator", "password123");
    await expect(updateUserRole(org, thirdParty.id, admin.id, "operator")).rejects.toThrow(LastAdminError);
  });

  it("updateUserRole blocks acting on a shared demo seed account", async () => {
    const { createUser, updateUserRole, DemoAccountActionError } = await import("@/lib/server/users");
    const admin = await createUser(`org-${Math.random()}`, `admin2-${Math.random()}@newco.example`, "Admin Two", "admin", "password123");
    await expect(updateUserRole("davwo", admin.id, "u-operator", "admin")).rejects.toThrow(DemoAccountActionError);
  });

  it("removeUser deletes an invited user in-memory, guarded the same way, and rejects an unknown id", async () => {
    const { createUser, removeUser, findById, UserNotFoundError, DemoAccountActionError, SelfActionError } = await import(
      "@/lib/server/users"
    );
    const org = `org-remove-${Math.random()}`;
    const admin = await createUser(org, `admin3-${Math.random()}@newco.example`, "Admin Three", "admin", "password123");
    const teammate = await createUser(org, `mate2-${Math.random()}@newco.example`, "Teammate Two", "operator", "password123");

    await expect(removeUser(org, admin.id, admin.id)).rejects.toThrow(SelfActionError);
    await expect(removeUser("davwo", admin.id, "u-pilot")).rejects.toThrow(DemoAccountActionError);
    await expect(removeUser(org, admin.id, "u-does-not-exist")).rejects.toThrow(UserNotFoundError);

    await removeUser(org, admin.id, teammate.id);
    expect(await findById(teammate.id)).toBeUndefined();
  });

  it("updateUserRole/removeUser reject an id that was never actually invited", async () => {
    const { createUser, updateUserRole, removeUser, UserNotFoundError } = await import("@/lib/server/users");
    const org = `org-ghost-${Math.random()}`;
    const admin = await createUser(org, `admin4-${Math.random()}@newco.example`, "Admin Four", "admin", "password123");
    await expect(updateUserRole(org, admin.id, "u-totally-unknown", "operator")).rejects.toThrow(UserNotFoundError);
    await expect(removeUser(org, admin.id, "u-totally-unknown")).rejects.toThrow(UserNotFoundError);
  });

  it("updateProfile updates the company field and throws for an unknown user id, in-memory", async () => {
    const { createUser, updateProfile } = await import("@/lib/server/users");
    const user = await createUser("org-x", `company-${Math.random()}@newco.example`, "Comp User", "admin", "password123");
    const updated = await updateProfile(user.id, { company: "Newco Ltd" });
    expect(updated.company).toBe("Newco Ltd");
    await expect(updateProfile("u-totally-unknown", { name: "X" })).rejects.toThrow("User not found");
  });

  it("updatePreferences is a safe no-op in-memory for an unknown user id", async () => {
    const { updatePreferences } = await import("@/lib/server/users");
    const result = await updatePreferences("u-totally-unknown", { autoOptimise: true });
    expect(result.autoOptimise).toBe(true);
  });

  it("listUsersWithReportsEnabled finds only subscribers in-memory, across orgs", async () => {
    const { createUser, updatePreferences, listUsersWithReportsEnabled } = await import("@/lib/server/users");
    const subscriber = await createUser(`org-a-${Math.random()}`, `sub-${Math.random()}@newco.example`, "Sub", "admin", "password123");
    const notSubscribed = await createUser(`org-b-${Math.random()}`, `nosub-${Math.random()}@newco.example`, "No Sub", "admin", "password123");
    await updatePreferences(subscriber.id, { reportSchedule: { enabled: true, period: "monthly", category: "carbon" } });
    await updatePreferences(notSubscribed.id, { reportSchedule: { enabled: false, period: "daily", category: "ani" } });

    const subscribers = await listUsersWithReportsEnabled();
    expect(subscribers.some((s) => s.user.id === subscriber.id)).toBe(true);
    expect(subscribers.some((s) => s.user.id === notSubscribed.id)).toBe(false);
    const found = subscribers.find((s) => s.user.id === subscriber.id);
    expect(found?.schedule).toEqual({ enabled: true, period: "monthly", category: "carbon" });
  });
});
