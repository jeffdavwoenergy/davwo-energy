-- AlterEnum: fleet vehicles can be registered as assets
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'Vehicle';

-- AlterTable: per-device-type fields (see src/lib/assetSpecs.ts)
ALTER TABLE "user_assets" ADD COLUMN IF NOT EXISTS "specs" JSONB;
