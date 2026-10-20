-- AlterTable
ALTER TABLE "owners" ADD COLUMN "createdByClinicId" TEXT,
ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "pets" ADD COLUMN "createdByClinicId" TEXT,
ADD COLUMN "createdById" TEXT;

-- CreateTable
CREATE TABLE "clinic_owners" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_owners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_owners_clinicId_idx" ON "clinic_owners"("clinicId");

-- CreateIndex
CREATE INDEX "clinic_owners_ownerId_idx" ON "clinic_owners"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_owners_clinicId_ownerId_key" ON "clinic_owners"("clinicId", "ownerId");

-- CreateIndex
CREATE INDEX "owners_createdByClinicId_idx" ON "owners"("createdByClinicId");

-- CreateIndex
CREATE INDEX "pets_createdByClinicId_idx" ON "pets"("createdByClinicId");

-- AddForeignKey
ALTER TABLE "clinic_owners" ADD CONSTRAINT "clinic_owners_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_owners" ADD CONSTRAINT "clinic_owners_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
