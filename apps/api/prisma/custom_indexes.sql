-- ==============================================================================
-- Índices Parciales Nativos de PostgreSQL para VetApp
-- Documentados en specs/plan.md (Sección 4.2) y specs/tasks.md (T04)
-- ==============================================================================

-- 1. Regla de negocio: Una mascota solo puede tener un único Tag en estado ACTIVE y no eliminado (RF-31)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_tag_per_pet" 
ON "tags" ("petId") 
WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

-- 2. Regla de negocio: UID físico único entre tags activos / no eliminados (RF-31)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_tag_uid" 
ON "tags" ("uid") 
WHERE "deletedAt" IS NULL;

-- 3. Regla de negocio: No colisión de correos entre usuarios activos (permite reactivación tras baja lógica)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_user_email" 
ON "users" ("email") 
WHERE "deletedAt" IS NULL;

-- 4. Regla de negocio: Cédula profesional única entre veterinarios activos (RF-11)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_vet_license" 
ON "users" ("licenseNumber") 
WHERE "licenseNumber" IS NOT NULL AND "deletedAt" IS NULL;

-- 5. Regla de negocio: Documento de identidad único entre dueños activos (RF-15)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_owner_document" 
ON "owners" ("documentId") 
WHERE "documentId" IS NOT NULL AND "deletedAt" IS NULL;

-- 6. Optimización de agenda: Prevención algorítmica de solapamiento en visitas activas (RF-40)
CREATE INDEX IF NOT EXISTS "idx_visits_vet_active_schedule" 
ON "visits" ("vetId", "scheduledDate") 
WHERE "status" IN ('PENDING', 'SCHEDULED') AND "deletedAt" IS NULL;

-- 7. Despacho programado: Notificaciones pendientes para procesamiento asíncrono e idempotente (RF-51, RF-52, RF-54)
CREATE INDEX IF NOT EXISTS "idx_pending_notifications" 
ON "notifications" ("targetDate", "retryCount") 
WHERE "status" = 'PENDING';
