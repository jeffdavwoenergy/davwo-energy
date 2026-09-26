import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const DEV_FALLBACK_SECRET = "dev-only-secret-change-in-production";

/** Resolved lazily (per sign/verify call, not at import time) so a missing
 * JWT_SECRET fails closed in production without affecting `next build`,
 * which never invokes signToken/verifyToken directly. */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is not set — refusing to sign/verify tokens with the public dev fallback in production.");
    }
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(raw);
}

const ALG = "HS256";

export interface TokenClaims extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  org: string;
}

export async function signToken(claims: { sub: string; email: string; role: string; org: string }) {
  const { sub, email, role, org } = claims;
  return new SignJWT({ email, role, org })
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime((process.env.JWT_EXPIRES ?? "").trim() || "12h")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify<TokenClaims>(token, getSecret());
  // jose only checks the signature/exp — it doesn't validate custom claims
  // against TokenClaims's shape, so a well-signed supplier token (role/org
  // both undefined) would otherwise "verify" here too. Without this check,
  // the two token kinds were only kept apart by luck (no customer user ever
  // matching a supplier's id) rather than by an actual rejection — this
  // makes the separation real.
  if (typeof payload.role !== "string" || typeof payload.org !== "string") {
    throw new Error("Not a customer token");
  }
  return payload;
}

/**
 * Supplier tokens are a structurally distinct shape (kind: "supplier", no
 * org/role) — not a variant of TokenClaims — so a supplier token can never
 * be mistaken for (or misused as) a customer session by code that only
 * checks for the presence of a field, and vice versa. Same secret/algorithm,
 * genuinely separate claims contract, matching the "separate portal"
 * decision for supplier self-service.
 */
export interface SupplierTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  kind: "supplier";
}

export async function signSupplierToken(claims: { sub: string; email: string }) {
  return new SignJWT({ email: claims.email, kind: "supplier" })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime((process.env.JWT_EXPIRES ?? "").trim() || "12h")
    .sign(getSecret());
}

export async function verifySupplierToken(token: string): Promise<SupplierTokenClaims> {
  const { payload } = await jwtVerify<SupplierTokenClaims>(token, getSecret());
  if (payload.kind !== "supplier") throw new Error("Not a supplier token");
  return payload;
}
