import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/* v8 ignore start -- requires a live Postgres (Supabase); exercised by tests via a fake prisma.ts mock instead */
function client(): PrismaClient {
  if (!global.__prismaClient) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    global.__prismaClient = new PrismaClient({ adapter });
  }
  return global.__prismaClient;
}

/** Returns null when DATABASE_URL is unset — callers fall back to in-memory demo data. */
export function getPrisma(): PrismaClient | null {
  if (!isDbConfigured()) return null;
  return client();
}
/* v8 ignore stop */
