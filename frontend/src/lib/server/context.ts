import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { tenantSeed } from "@/lib/server/tenants";

interface TenantCtx {
  seed: number;
  orgId: string;
}

const als = new AsyncLocalStorage<TenantCtx>();

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Thrown by withMutateTenant for a valid, authenticated token whose role
 * just isn't permitted — distinct from UnauthorizedError so callers can
 * return 403 (logged in, not allowed) rather than 401 (not logged in). */
export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** Seed for the current request's tenant. Only meaningful inside withTenant. */
export function currentSeed(): number {
  return als.getStore()?.seed ?? 42;
}

export function currentOrg(): string {
  return als.getStore()?.orgId ?? "davwo";
}

/**
 * Run a route handler inside the tenant context derived from its JWT.
 * Throws UnauthorizedError (never falls back to a default org) if the
 * request has no valid bearer token — callers must use tenantJson (or
 * catch UnauthorizedError themselves) to turn that into a 401.
 */
export async function withTenant<T>(req: Request, fn: () => Promise<T> | T): Promise<T> {
  const claims = await getAuth(req);
  if (!claims || typeof claims.org !== "string") throw new UnauthorizedError();
  return als.run({ seed: tenantSeed(claims.org), orgId: claims.org }, async () => fn());
}

/** Same as withTenant, but for routes that change organisation data (create/
 * edit/delete assets, bulk imports, marketplace decisions) rather than just
 * reading it or interacting with per-user state (chat, alert ack/dismiss).
 * "pilot" is this platform's read-only trial tier — everything else (operator,
 * admin) can mutate. Throws ForbiddenError (never UnauthorizedError) for a
 * valid pilot-role token, so callers can tell "not logged in" from "logged in,
 * not permitted" and return 401 vs 403 accordingly. */
export async function withMutateTenant<T>(req: Request, fn: () => Promise<T> | T): Promise<T> {
  const claims = await getAuth(req);
  if (!claims || typeof claims.org !== "string") throw new UnauthorizedError();
  if (claims.role === "pilot") throw new ForbiddenError();
  return als.run({ seed: tenantSeed(claims.org), orgId: claims.org }, async () => fn());
}

/** withTenant + JSON response, translating a missing/invalid token into a 401. */
export async function tenantJson<T>(req: Request, fn: () => Promise<T> | T): Promise<Response> {
  try {
    return NextResponse.json(await withTenant(req, fn));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
