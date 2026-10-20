-- CreateEnum
CREATE TYPE "ClinicOwnerStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- DropIndex
DROP INDEX IF EXISTS "clinic_owners_clinicId_idx";
DROP INDEX IF EXISTS "clinic_owners_ownerId_idx";

-- AlterTable
ALTER TABLE "clinic_owners" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "clinic_owners" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "clinic_owners" ALTER COLUMN "status" TYPE "ClinicOwnerStatus" USING ("status"::text::"ClinicOwnerStatus");
ALTER TABLE "clinic_owners" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "clinic_owners_clinicId_status_idx" ON "clinic_owners"("clinicId", "status");

-- CreateIndex
CREATE INDEX "clinic_owners_ownerId_status_idx" ON "clinic_owners"("ownerId", "status");
