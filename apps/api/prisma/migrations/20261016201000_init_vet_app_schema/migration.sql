-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VET', 'RECEPTION');

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('CANINE', 'FELINE', 'AVIAN', 'EQUINE', 'RODENT', 'REPTILE', 'OTHER');

-- CreateEnum
CREATE TYPE "PetSex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReproductiveStatus" AS ENUM ('INTACT', 'NEUTERED', 'SPAYED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PENDING', 'SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('NFC_SCAN', 'MANUAL_LOOKUP', 'HISTORY_VIEW', 'EMERGENCY_SCAN');

-- CreateEnum
CREATE TYPE "GrantSource" AS ENUM ('NFC_TAP', 'OWNER_SIGNATURE', 'CLINIC_REFERRAL', 'EMERGENCY_OVERRIDE');

-- CreateEnum
CREATE TYPE "GrantScope" AS ENUM ('FULL_HISTORY', 'VACCINES_ONLY');

-- CreateTable
CREATE TABLE "clinics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPTION',
    "clinicId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "name" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "PetSpecies" NOT NULL,
    "breed" TEXT,
    "sex" "PetSex" NOT NULL DEFAULT 'UNKNOWN',
    "birthDate" TIMESTAMP(3),
    "isApproximateBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "reproductiveStatus" "ReproductiveStatus" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "ownerId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "TagStatus" NOT NULL DEFAULT 'ACTIVE',
    "petId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "source" "GrantSource" NOT NULL DEFAULT 'NFC_TAP',
    "scope" "GrantScope" NOT NULL DEFAULT 'FULL_HISTORY',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clinicId" TEXT,
    "userId" TEXT,
    "action" "AccessAction" NOT NULL DEFAULT 'NFC_SCAN',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "vetId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "weight" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "VisitStatus" NOT NULL DEFAULT 'PENDING',
    "cancellationReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_notes" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "vetId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clinicId" TEXT,
    "vetId" TEXT,
    "vaccineName" TEXT NOT NULL,
    "batchNumber" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "petId" TEXT,
    "visitId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_code_key" ON "clinics"("code");

-- CreateIndex
CREATE INDEX "users_clinicId_idx" ON "users"("clinicId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "owners_documentId_idx" ON "owners"("documentId");

-- CreateIndex
CREATE INDEX "owners_phone_idx" ON "owners"("phone");

-- CreateIndex
CREATE INDEX "owners_lastName_idx" ON "owners"("lastName");

-- CreateIndex
CREATE INDEX "pets_ownerId_idx" ON "pets"("ownerId");

-- CreateIndex
CREATE INDEX "pets_name_idx" ON "pets"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_publicCode_key" ON "tags"("publicCode");

-- CreateIndex
CREATE INDEX "tags_uid_idx" ON "tags"("uid");

-- CreateIndex
CREATE INDEX "tags_publicCode_idx" ON "tags"("publicCode");

-- CreateIndex
CREATE INDEX "tags_petId_idx" ON "tags"("petId");

-- CreateIndex
CREATE INDEX "access_grants_petId_clinicId_expiresAt_idx" ON "access_grants"("petId", "clinicId", "expiresAt");

-- CreateIndex
CREATE INDEX "access_logs_petId_timestamp_idx" ON "access_logs"("petId", "timestamp");

-- CreateIndex
CREATE INDEX "access_logs_clinicId_timestamp_idx" ON "access_logs"("clinicId", "timestamp");

-- CreateIndex
CREATE INDEX "access_logs_userId_idx" ON "access_logs"("userId");

-- CreateIndex
CREATE INDEX "visits_clinicId_scheduledDate_idx" ON "visits"("clinicId", "scheduledDate");

-- CreateIndex
CREATE INDEX "visits_petId_idx" ON "visits"("petId");

-- CreateIndex
CREATE INDEX "visits_vetId_idx" ON "visits"("vetId");

-- CreateIndex
CREATE INDEX "visit_notes_visitId_idx" ON "visit_notes"("visitId");

-- CreateIndex
CREATE INDEX "visit_notes_vetId_idx" ON "visit_notes"("vetId");

-- CreateIndex
CREATE INDEX "vaccinations_petId_idx" ON "vaccinations"("petId");

-- CreateIndex
CREATE INDEX "vaccinations_nextDueDate_idx" ON "vaccinations"("nextDueDate");

-- CreateIndex
CREATE INDEX "vaccinations_clinicId_idx" ON "vaccinations"("clinicId");

-- CreateIndex
CREATE INDEX "attachments_petId_idx" ON "attachments"("petId");

-- CreateIndex
CREATE INDEX "attachments_visitId_idx" ON "attachments"("visitId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_vetId_fkey" FOREIGN KEY ("vetId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_vetId_fkey" FOREIGN KEY ("vetId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_vetId_fkey" FOREIGN KEY ("vetId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Partial Unique Indexes for Soft-Delete and Domain Invariants (SQL Hand-crafted)
-- ==============================================================================

-- 1. Regla de negocio: Una mascota solo puede tener un único Tag en estado ACTIVE y no eliminado
CREATE UNIQUE INDEX "unique_active_tag_per_pet" 
ON "tags" ("petId") 
WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

-- 2. Regla de negocio: No colisión de correos entre usuarios activos (permite reactivación tras baja lógica)
CREATE UNIQUE INDEX "unique_active_user_email" 
ON "users" ("email") 
WHERE "deletedAt" IS NULL;

-- 3. Regla de negocio: Cédula profesional única entre veterinarios activos
CREATE UNIQUE INDEX "unique_active_vet_license" 
ON "users" ("licenseNumber") 
WHERE "licenseNumber" IS NOT NULL AND "deletedAt" IS NULL;

-- 4. Regla de negocio: Documento de identidad único entre dueños activos
CREATE UNIQUE INDEX "unique_active_owner_document" 
ON "owners" ("documentId") 
WHERE "documentId" IS NOT NULL AND "deletedAt" IS NULL;

-- 5. Regla de negocio: UID físico único entre tags activos / no eliminados
CREATE UNIQUE INDEX "unique_active_tag_uid" 
ON "tags" ("uid") 
WHERE "deletedAt" IS NULL;
