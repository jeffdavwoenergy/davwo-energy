// AES-256-GCM encryption for third-party device credentials at rest. The key
// is Davwo's own (INTEGRATIONS_ENCRYPTION_KEY, 32 bytes as base64 or hex) —
// credentials are never stored in plain text or returned by any API.
//
// Without the key: production refuses to store credentials (fails closed,
// same policy as JWT_SECRET in jwt.ts); development derives one from a fixed
// dev string so local testing works.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(): Buffer {
  const raw = (process.env.INTEGRATIONS_ENCRYPTION_KEY ?? "").trim();
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex chars).");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not set — refusing to store device credentials in production.");
  }
  return createHash("sha256").update("davwo-dev-only-integrations-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised credential format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
