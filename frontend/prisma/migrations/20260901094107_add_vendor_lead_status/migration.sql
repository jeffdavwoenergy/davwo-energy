-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'responded', 'accepted', 'declined');

-- AlterTable
ALTER TABLE "vendor_leads" ADD COLUMN "status" "LeadStatus" NOT NULL DEFAULT 'new';
ALTER TABLE "vendor_leads" ADD COLUMN "response" TEXT;
ALTER TABLE "vendor_leads" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "vendor_leads" ADD COLUMN "decidedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "vendor_leads_vendorId_idx" ON "vendor_leads"("vendorId");
