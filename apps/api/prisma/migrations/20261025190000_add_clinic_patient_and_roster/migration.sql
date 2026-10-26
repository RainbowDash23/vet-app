-- CreateEnum
CREATE TYPE "ClinicPatientSource" AS ENUM ('REGISTERED', 'ADDED_AFTER_SCAN');

-- AlterEnum
ALTER TYPE "AccessAction" ADD VALUE 'ROSTER_ADD';

-- CreateTable
CREATE TABLE "clinic_patients" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "source" "ClinicPatientSource" NOT NULL DEFAULT 'REGISTERED',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_patients_clinicId_petId_key" ON "clinic_patients"("clinicId", "petId");

-- CreateIndex
CREATE INDEX "clinic_patients_clinicId_addedAt_idx" ON "clinic_patients"("clinicId", "addedAt");

-- CreateIndex
CREATE INDEX "clinic_patients_petId_idx" ON "clinic_patients"("petId");

-- AddForeignKey
ALTER TABLE "clinic_patients" ADD CONSTRAINT "clinic_patients_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_patients" ADD CONSTRAINT "clinic_patients_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill para mascotas ya existentes
INSERT INTO "clinic_patients" ("id", "clinicId", "petId", "source", "addedAt", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text AS "id",
    COALESCE(
        p."createdByClinicId",
        (SELECT co."clinicId" FROM "clinic_owners" co WHERE co."ownerId" = p."ownerId" ORDER BY co."consentedAt" ASC LIMIT 1),
        (SELECT v."clinicId" FROM "visits" v WHERE v."petId" = p."id" ORDER BY v."scheduledDate" ASC LIMIT 1)
    ) AS "clinicId",
    p."id" AS "petId",
    'REGISTERED'::"ClinicPatientSource" AS "source",
    p."createdAt" AS "addedAt",
    CURRENT_TIMESTAMP AS "createdAt",
    CURRENT_TIMESTAMP AS "updatedAt"
FROM "pets" p
WHERE COALESCE(
    p."createdByClinicId",
    (SELECT co."clinicId" FROM "clinic_owners" co WHERE co."ownerId" = p."ownerId" ORDER BY co."consentedAt" ASC LIMIT 1),
    (SELECT v."clinicId" FROM "visits" v WHERE v."petId" = p."id" ORDER BY v."scheduledDate" ASC LIMIT 1)
) IS NOT NULL
ON CONFLICT ("clinicId", "petId") DO NOTHING;
