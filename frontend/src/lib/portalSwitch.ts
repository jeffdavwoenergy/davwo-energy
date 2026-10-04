"use client";

// Switching between ANI™ and the Supplier Portal. They keep separate
// sessions in the same browser, which can belong to different people (e.g.
// an earlier ANI™ sign-in as admin and a supplier sign-in as someone else),
// so a session on the other side is only reused when it's for the same
// email — and a new one is only issued for an account the server has
// LINKED to this one (see /api/membership/link and /switch).

import api, { getToken, setToken } from "@/lib/api";
import supplierApi, { getSupplierToken, setSupplierToken } from "@/lib/supplierApi";
import type { Membership } from "@/lib/server/membership";

export type Platform = "ani" | "supplier";

export const PLATFORM_PATHS: Record<Platform, { home: string; login: string; join: string; settings: string }> = {
  ani: { home: "/dashboard", login: "/login", join: "/signup", settings: "/settings" },
  supplier: { home: "/supplier/dashboard", login: "/supplier/login", join: "/supplier/signup", settings: "/supplier/settings" },
};

export function platformToken(p: Platform): string | null {
  return p === "ani" ? getToken() : getSupplierToken();
}

/** The `email` claim of a session token, read client-side for routing only —
 * the server still verifies every token on every request. */
export function tokenEmail(token: string | null): string | undefined {
  if (!token) return undefined;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const email = (JSON.parse(atob(payload)) as { email?: unknown }).email;
    return typeof email === "string" ? email.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** True if the browser already has a session on `to` for the same email as
 * the current platform's session. */
export function hasMatchingSession(from: Platform, to: Platform): boolean {
  const mine = tokenEmail(platformToken(from));
  return Boolean(mine && tokenEmail(platformToken(to)) === mine);
}

/**
 * Where to send someone switching from `from` to `to`, without any server
 * call — used when the accounts aren't linked:
 * - no account on `to` for this email → that platform's sign-up
 * - signed in on `to` as the same email → straight to its dashboard
 * - otherwise → its sign-in page, email pre-filled, without auto-redirecting
 *   into whatever other account is signed in there.
 */
export function switchTarget(from: Platform, to: Platform, hasAccountThere: boolean): string {
  const paths = PLATFORM_PATHS[to];
  if (!hasAccountThere) return paths.join;
  if (hasMatchingSession(from, to)) return paths.home;
  const email = tokenEmail(platformToken(from));
  return `${paths.login}?switch=1${email ? `&email=${encodeURIComponent(email)}` : ""}`;
}

/**
 * Performs a platform switch, landing on `dest` (default: that platform's
 * dashboard). For linked accounts it asks the server for a session on the
 * other platform and returns `{ reload: dest }` — the caller does a full
 * page load so that platform boots fresh with its new session. Otherwise
 * returns `{ navigate: path }` from switchTarget.
 */
export async function performSwitch(
  from: Platform,
  to: Platform,
  membership: Membership | null,
  dest: string = PLATFORM_PATHS[to].home,
): Promise<{ reload?: string; navigate?: string }> {
  if (hasMatchingSession(from, to)) return { navigate: dest };
  if (membership?.[to] && membership.linked) {
    try {
      const { data } = await (from === "ani" ? api : supplierApi).post<{ token: string }>("/membership/switch", { to });
      (to === "ani" ? setToken : setSupplierToken)(data.token);
      return { reload: dest };
    } catch {
      // Not linked after all (or link removed) — fall back to signing in.
    }
  }
  return { navigate: switchTarget(from, to, membership ? membership[to] : true) };
}

/** After a sign-in: if this browser now holds sessions for BOTH platforms
 * with the same email, link the two accounts so future switches skip the
 * sign-in. Best-effort — failure just means the next switch asks to sign in. */
export async function linkSessionsIfSameEmail(): Promise<void> {
  const aniToken = getToken();
  const supplierToken = getSupplierToken();
  if (!aniToken || !supplierToken || tokenEmail(aniToken) !== tokenEmail(supplierToken)) return;
  await api.post("/membership/link", { aniToken, supplierToken }).catch(() => undefined);
}
