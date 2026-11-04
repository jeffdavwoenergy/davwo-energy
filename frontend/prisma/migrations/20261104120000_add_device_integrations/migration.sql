-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'error', 'disabled');

-- AlterTable: devices discovered through a device integration
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "telemetry" JSONB;
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- CreateIndex: NULLs are distinct in Postgres unique indexes, so manually
-- registered assets (externalSource/externalId NULL) are unaffected.
CREATE UNIQUE INDEX "user_assets_orgId_externalSource_externalId_key" ON "user_assets"("orgId", "externalSource", "externalId");

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credentials" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_orgId_idx" ON "integration_connections"("orgId");

-- Supabase exposes the public schema over its REST API. The app only ever
-- reaches this table through Prisma as the table owner (which bypasses RLS),
-- so enabling RLS with no policies keeps encrypted credentials unreachable
-- via the anon/publishable key.
ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
