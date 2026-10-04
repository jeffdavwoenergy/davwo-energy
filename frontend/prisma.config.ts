import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js's own convention is .env.local for local secrets (see .env.example);
// bare `dotenv/config` only auto-loads a file literally named `.env`, which
// this project doesn't use — so the Prisma CLI (running outside Next's
// runtime) needs to be told explicitly where to look.
loadEnv({ path: ".env.local" });

/**
 * Prisma 7 moved connection URLs out of schema.prisma. This file's
 * `datasource.url` is used by the Prisma CLI (migrate/introspect) only —
 * it should be Supabase's DIRECT connection string (port 5432), not the
 * pooled one. The app's actual runtime connection (pooled, port 6543) is
 * configured separately via the @prisma/adapter-pg driver adapter passed
 * to the PrismaClient constructor in src/lib/server/prisma.ts.
 *
 * DIRECT_URL is optional here: `prisma generate` (run by postinstall, e.g.
 * during a Vercel build) never connects to the database, so it must not fail
 * when the variable is absent. migrate/introspect still need it set.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(process.env.DIRECT_URL ? { datasource: { url: process.env.DIRECT_URL } } : {}),
});
