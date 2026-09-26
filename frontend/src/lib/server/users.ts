import { randomUUID, randomBytes } from "node:crypto";
import type { Role, User, Preferences } from "@/lib/types";
import { Prisma, type UserRole } from "@prisma/client";
import { resolveTenant } from "@/lib/server/tenants";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { sendEmail, emailShell, escapeHtml, isEmailConfigured } from "@/lib/server/email";

/**
 * Phase 1: in-memory demo accounts so auth works on Vercel without a DB.
 * Phase 2: once DATABASE_URL is set, these become the one-time seed for the
 * `users` table (passwords bcrypt-hashed on insert) and every lookup below
 * reads from Postgres instead. No DB configured → falls back to this
 * in-memory array unchanged, same graceful-degradation pattern as
 * USE_REAL_DATA for the external data sources.
 */
interface DemoUser extends User {
  password: string;
}

interface UserRecord extends User {
  passwordHash: string;
}

type AnyUser = DemoUser | UserRecord;

export const DEFAULT_PREFERENCES: Preferences = { liveData: true, emailAlerts: true, autoOptimise: false };

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo@123";

export const DEMO_USERS: DemoUser[] = [
  {
    id: "u-admin",
    email: "admin@davwo.com",
    name: "Avery Stone",
    role: "admin",
    orgId: "davwo",
    company: "Davwo Energy Ltd",
    job_title: "Platform Administrator",
    avatar_initials: "AS",
    password: DEMO_PASSWORD,
  },
  {
    id: "u-operator",
    email: "operator@davwo.com",
    name: "Olu Bankole",
    role: "operator",
    orgId: "davwo",
    company: "Davwo Energy Ltd",
    job_title: "Network Operator",
    avatar_initials: "OB",
    password: DEMO_PASSWORD,
  },
  {
    id: "u-pilot",
    email: "pilot@davwo.com",
    name: "Priya Nair",
    role: "pilot",
    orgId: "pilot-mcr",
    company: "Northbridge Mobility",
    job_title: "Pilot Evaluator",
    avatar_initials: "PN",
    password: DEMO_PASSWORD,
  },
];

/** Per-instance fallback for invited users when no DB is configured — same
 * accepted limitation as other module-level state in this codebase. */
const invitedMemoryUsers: UserRecord[] = [];

/** All users visible in the no-DB fallback: seeded demo accounts + any
 * invited this session. Every in-memory lookup must go through this so
 * invited users are first-class (findable, and caught by dup-email checks). */
function inMemoryUsers(): AnyUser[] {
  return [...DEMO_USERS, ...invitedMemoryUsers];
}

let seeded = false;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  passwordHash: string;
  company: string | null;
  jobTitle: string | null;
  avatarInitials: string | null;
  preferences: unknown;
}

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    orgId: row.orgId,
    passwordHash: row.passwordHash,
    company: row.company ?? undefined,
    job_title: row.jobTitle ?? undefined,
    avatar_initials: row.avatarInitials ?? undefined,
    preferences: (row.preferences as Preferences | null) ?? undefined,
  };
}

/** One-time, idempotent seed of the `users` table from DEMO_USERS (bcrypt-hashed).
 * No-op once seeded. Only ever called from within an isDbConfigured() check, so getPrisma()
 * is guaranteed non-null here — same invariant the lookup functions below rely on. */
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const prisma = getPrisma()!;
  const count = await prisma.user.count();
  if (count === 0) {
    const docs = await Promise.all(
      DEMO_USERS.map(async (u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as UserRole,
        orgId: u.orgId,
        passwordHash: await hashPassword(u.password),
        company: u.company ?? null,
        jobTitle: u.job_title ?? null,
        avatarInitials: u.avatar_initials ?? null,
      })),
    );
    await prisma.user.createMany({ data: docs });
  }
  seeded = true;
}

export async function findByEmail(email: string): Promise<AnyUser | undefined> {
  const normalized = email.toLowerCase().trim();
  if (isDbConfigured()) {
    await ensureSeeded();
    const prisma = getPrisma()!;
    const doc = await prisma.user.findUnique({ where: { email: normalized } });
    return doc ? fromRow(doc) : undefined;
  }
  return inMemoryUsers().find((u) => u.email === normalized);
}

export async function findByRole(role: Role): Promise<AnyUser | undefined> {
  if (isDbConfigured()) {
    await ensureSeeded();
    const prisma = getPrisma()!;
    const doc = await prisma.user.findFirst({ where: { role: role as UserRole } });
    return doc ? fromRow(doc) : undefined;
  }
  return inMemoryUsers().find((u) => u.role === role);
}

export async function findById(id: string): Promise<AnyUser | undefined> {
  if (isDbConfigured()) {
    await ensureSeeded();
    const prisma = getPrisma()!;
    const doc = await prisma.user.findUnique({ where: { id } });
    return doc ? fromRow(doc) : undefined;
  }
  return inMemoryUsers().find((u) => u.id === id);
}

/** True if `plain` matches the user's stored credential — bcrypt-verified when
 * backed by Mongo, plain-compared for the in-memory demo fallback (unchanged
 * from pre-Phase-2 behaviour; only ever reached when no DB is configured). */
export function checkPassword(user: AnyUser, plain: string): Promise<boolean> {
  if ("passwordHash" in user) return verifyPassword(plain, user.passwordHash);
  return Promise.resolve(user.password === plain);
}

export async function publicUser(u: AnyUser, orgId?: string): Promise<User> {
  const { password: _pw, passwordHash: _ph, ...rest } = u as DemoUser & Partial<UserRecord>;
  void _pw;
  void _ph;
  const effectiveOrg = orgId ?? rest.orgId;
  const tenant = await resolveTenant(effectiveOrg);
  return { ...rest, orgId: effectiveOrg, orgName: tenant.name, preferences: rest.preferences ?? DEFAULT_PREFERENCES };
}

export async function listOrgUsers(orgId: string): Promise<User[]> {
  if (isDbConfigured()) {
    await ensureSeeded();
    const prisma = getPrisma()!;
    const docs = await prisma.user.findMany({ where: { orgId } });
    return Promise.all(docs.map((d) => publicUser(fromRow(d))));
  }
  return Promise.all(
    inMemoryUsers()
      .filter((u) => u.orgId === orgId)
      .map((u) => publicUser(u)),
  );
}

export class DemoAccountActionError extends Error {
  constructor() {
    super("This is a shared demo account and can't be removed or have its role changed.");
    this.name = "DemoAccountActionError";
  }
}

export class SelfActionError extends Error {
  constructor() {
    super("You can't change your own role or remove yourself — ask another admin.");
    this.name = "SelfActionError";
  }
}

export class LastAdminError extends Error {
  constructor() {
    super("An organisation must always keep at least one admin.");
    this.name = "LastAdminError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

async function countAdmins(orgId: string): Promise<number> {
  if (isDbConfigured()) {
    await ensureSeeded();
    const prisma = getPrisma()!;
    return prisma.user.count({ where: { orgId, role: "admin" } });
  }
  return inMemoryUsers().filter((u) => u.orgId === orgId && u.role === "admin").length;
}

/** Shared guards for both role-change and removal: never touch a shared demo
 * seed account, never let a caller act on themselves (avoids accidental
 * self-lockout), and never drop an org below one admin. */
async function assertMutable(orgId: string, actingUserId: string, targetUserId: string, demotingFromAdmin: boolean): Promise<AnyUser> {
  if (DEMO_USERS.some((u) => u.id === targetUserId)) throw new DemoAccountActionError();
  if (actingUserId === targetUserId) throw new SelfActionError();
  const target = await findById(targetUserId);
  if (!target || target.orgId !== orgId) throw new UserNotFoundError();
  if (demotingFromAdmin && target.role === "admin" && (await countAdmins(orgId)) <= 1) throw new LastAdminError();
  return target;
}

/** Changes a teammate's role. Guarded so the org can never end up with zero
 * admins, and so a shared demo account can't be reassigned by a visitor.
 * assertMutable already resolved and validated the target (it can only be an
 * invited in-memory record here — demo seeds are rejected above), so its
 * return value is used directly rather than re-searching for it. */
export async function updateUserRole(orgId: string, actingUserId: string, targetUserId: string, role: Role): Promise<User> {
  const target = await assertMutable(orgId, actingUserId, targetUserId, role !== "admin");

  if (!isDbConfigured()) {
    (target as UserRecord).role = role;
    return publicUser(target);
  }
  const prisma = getPrisma()!;
  const doc = await prisma.user.update({ where: { id: targetUserId }, data: { role: role as UserRole } });
  return publicUser(fromRow(doc));
}

/** Removes a teammate from the org. Same guards as updateUserRole. */
export async function removeUser(orgId: string, actingUserId: string, targetUserId: string): Promise<void> {
  await assertMutable(orgId, actingUserId, targetUserId, true);

  if (!isDbConfigured()) {
    const idx = invitedMemoryUsers.findIndex((u) => u.id === targetUserId);
    invitedMemoryUsers.splice(idx, 1);
    return;
  }
  const prisma = getPrisma()!;
  await prisma.user.delete({ where: { id: targetUserId } });
}

export class EmailInUseError extends Error {
  constructor() {
    super("A user with this email already exists");
    this.name = "EmailInUseError";
  }
}

/** Creates a user with a caller-chosen password (bcrypt-hashed) — used by
 * self-service signup, where the user picks their own credential up front
 * (unlike inviteUser's temp-password flow below). */
/** True for a Postgres unique-constraint violation (P2002) — the check-then-
 * insert email-uniqueness guard above is inherently racy under concurrent
 * requests (two near-simultaneous signups/invites for the same email can
 * both pass the findByEmail check before either insert lands), so the
 * insert itself is the real, DB-enforced guarantee; this turns the resulting
 * raw constraint error back into the clean domain error callers expect,
 * instead of an unhandled 500 on a public, unauthenticated endpoint. */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createUser(orgId: string, email: string, name: string, role: Role, password: string): Promise<User> {
  const normalized = email.toLowerCase().trim();
  if (await findByEmail(normalized)) throw new EmailInUseError();

  const record: UserRecord = {
    id: `u-${randomUUID()}`,
    email: normalized,
    name,
    role,
    orgId,
    passwordHash: await hashPassword(password),
  };

  if (!isDbConfigured()) {
    invitedMemoryUsers.push(record);
    return publicUser(record);
  }
  const prisma = getPrisma()!;
  try {
    await prisma.user.create({
      data: { id: record.id, email: record.email, name: record.name, role: record.role as UserRole, orgId: record.orgId, passwordHash: record.passwordHash },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new EmailInUseError();
    throw err;
  }
  return publicUser(record);
}

export interface InviteResult { user: User; emailed: boolean; tempPassword?: string }

/** Invites a user with a random temp password. Emails it via Resend when
 * configured (emailed:true, password withheld from the response). Without an
 * email provider set up, returns the temp password directly in the result so
 * the inviting admin can relay it manually — the invite flow must never
 * create an account nobody can ever log into, which was the bug this fixes.
 * Without a DB, the invite is per-instance only (documented limitation, same
 * as assetsStore/alertState). */
export async function inviteUser(orgId: string, email: string, name: string, role: Role): Promise<InviteResult> {
  const normalized = email.toLowerCase().trim();
  if (await findByEmail(normalized)) throw new EmailInUseError();

  const tempPassword = randomBytes(9).toString("base64url");
  const record: UserRecord = {
    id: `u-${randomUUID()}`,
    email: normalized,
    name,
    role,
    orgId,
    passwordHash: await hashPassword(tempPassword),
  };

  if (!isDbConfigured()) {
    invitedMemoryUsers.push(record);
  } else {
    const prisma = getPrisma()!;
    try {
      await prisma.user.create({
        data: { id: record.id, email: record.email, name: record.name, role: record.role as UserRole, orgId: record.orgId, passwordHash: record.passwordHash },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new EmailInUseError();
      throw err;
    }
  }

  const user = await publicUser(record);
  if (!isEmailConfigured()) {
    return { user, emailed: false, tempPassword };
  }
  const sent = await sendEmail({
    to: normalized,
    subject: "You've been invited to Ask ANI™",
    html: emailShell("You're invited", `<p>${escapeHtml(name)}, you've been added to ${escapeHtml(user.orgName ?? "")}'s Ask ANI&#8482; workspace as ${role}.</p><p>Temporary password: <b>${tempPassword}</b></p><p>Sign in and change it from Settings once you're in.</p>`),
  });
  return sent.sent ? { user, emailed: true } : { user, emailed: false, tempPassword };
}

export interface ProfileUpdate {
  name?: string;
  company?: string;
  job_title?: string;
}

/** Updates the caller's own display profile — never touches credentials, so
 * (unlike changePassword) this is allowed even without a DB: it mutates the
 * in-memory record directly, same low-stakes per-instance limitation as the
 * rest of this file's fallback paths. */
export async function updateProfile(userId: string, updates: ProfileUpdate): Promise<User> {
  const patch: Record<string, string> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.company !== undefined) patch.company = updates.company;
  if (updates.job_title !== undefined) patch.job_title = updates.job_title;

  if (!isDbConfigured()) {
    const found = inMemoryUsers().find((u) => u.id === userId);
    if (!found) throw new Error("User not found");
    Object.assign(found, patch);
    return publicUser(found);
  }
  const prisma = getPrisma()!;
  const doc = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.company !== undefined ? { company: patch.company } : {}),
      ...(patch.job_title !== undefined ? { jobTitle: patch.job_title } : {}),
    },
  });
  return publicUser(fromRow(doc));
}

/** Per-user settings-panel toggles (live data / email alerts / auto-optimise).
 * Same graceful-degradation shape as everything else — in-memory mutation
 * without a DB, a real Postgres column once one is connected. */
export async function getPreferences(userId: string): Promise<Preferences> {
  if (!isDbConfigured()) {
    const found = inMemoryUsers().find((u) => u.id === userId);
    return found?.preferences ?? DEFAULT_PREFERENCES;
  }
  const prisma = getPrisma()!;
  const doc = await prisma.user.findUnique({ where: { id: userId } });
  return (doc?.preferences as Preferences | null) ?? DEFAULT_PREFERENCES;
}

/** Merges `updates` into the user's stored preferences — shallow, same as
 * the object-spread this replaced on the Postgres path (every caller already
 * resolves a full reportSchedule object before calling this, so a shallow
 * top-level merge is the correct semantics, not a bug — see
 * parseReportSchedule in the preferences route). The Postgres path does this
 * as one atomic JSONB merge (not read-then-write) so two concurrent updates
 * for the same user (two toggles clicked in quick succession, two open tabs)
 * can't silently drop one of them — same race-safety reasoning as
 * AlertState/VendorLead elsewhere in this codebase. */
export async function updatePreferences(userId: string, updates: Partial<Preferences>): Promise<Preferences> {
  if (!isDbConfigured()) {
    const current = await getPreferences(userId);
    const next: Preferences = { ...current, ...updates };
    const found = inMemoryUsers().find((u) => u.id === userId);
    if (found) found.preferences = next;
    return next;
  }
  const prisma = getPrisma()!;
  const rows = await prisma.$queryRaw<{ preferences: Preferences }[]>`
    UPDATE users
    SET preferences = COALESCE(preferences, ${JSON.stringify(DEFAULT_PREFERENCES)}::jsonb) || ${JSON.stringify(updates)}::jsonb
    WHERE id = ${userId}
    RETURNING preferences
  `;
  return rows[0]?.preferences ?? ({ ...DEFAULT_PREFERENCES, ...updates } as Preferences);
}

export interface ScheduledReportUser {
  user: User;
  schedule: NonNullable<Preferences["reportSchedule"]>;
}

/** Every user (across every org) with an enabled report schedule — the
 * driver list for the scheduled-reports cron job. Deliberately not
 * org-scoped like listOrgUsers: a cron run has no tenant context, it has to
 * discover every subscriber itself. */
export async function listUsersWithReportsEnabled(): Promise<ScheduledReportUser[]> {
  if (!isDbConfigured()) {
    return inMemoryUsers()
      .filter((u) => u.preferences?.reportSchedule?.enabled)
      .map((u) => ({ user: u, schedule: u.preferences!.reportSchedule! }));
  }
  const prisma = getPrisma()!;
  const docs = await prisma.user.findMany({ where: {} });
  const out: ScheduledReportUser[] = [];
  for (const doc of docs) {
    const prefs = doc.preferences as Preferences | null;
    if (prefs?.reportSchedule?.enabled) out.push({ user: fromRow(doc), schedule: prefs.reportSchedule });
  }
  return out;
}

export class DemoAccountPasswordError extends Error {
  constructor() {
    super("Password changes aren't available in demo mode (no database configured) — changing a shared demo account's password would lock out every other visitor of this deployment.");
    this.name = "DemoAccountPasswordError";
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Current password is incorrect");
    this.name = "WrongPasswordError";
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!isDbConfigured()) throw new DemoAccountPasswordError();
  const user = await findById(userId);
  if (!user || !(await checkPassword(user, currentPassword))) throw new WrongPasswordError();
  const prisma = getPrisma()!;
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}
