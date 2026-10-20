import { describe, it, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { AccessAction, GrantScope, GrantSource, Role, TagStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TagsService } from '../src/modules/tags/tags.service';
import { AccessGrantsService } from '../src/modules/pets/access-grants.service';
import {
  createTestApp,
  CLINIC_A_ID,
  CLINIC_B_ID,
  USER_VET_B_ID,
  PET_1_ID,
  OWNER_1_ID,
  TAG_1_UID,
} from './e2e-helper';

describe('E2E: Transaccionalidad Atómica y Reversión Total (Rollback) contra PostgreSQL Real (RF-56)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tagsService: TagsService;
  let accessGrantsService: AccessGrantsService;

  before(async () => {
    process.env.USE_REAL_DB = 'true';
    const port = process.env.POSTGRES_PORT || '5433';
    const user = process.env.POSTGRES_USER || 'vet_admin';
    const password = process.env.POSTGRES_PASSWORD || 'vet_secure_password_123';
    const dbName = process.env.POSTGRES_DB || 'vet_app_db';
    process.env.DATABASE_URL = `postgresql://${user}:${password}@localhost:${port}/${dbName}?schema=public`;

    const testContext = await createTestApp();
    app = testContext.app;
    prisma = app.get(PrismaService);
    tagsService = app.get(TagsService);
    accessGrantsService = app.get(AccessGrantsService);

    if (testContext.syncToPostgres) {
      await testContext.syncToPostgres();
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Limpiar trazas transaccionales previas de la mascota de prueba
    await prisma.accessLog.deleteMany({ where: { petId: PET_1_ID } });
    await prisma.accessGrant.deleteMany({ where: { petId: PET_1_ID } });
    await prisma.clinicOwner.deleteMany({
      where: { clinicId: CLINIC_B_ID, ownerId: OWNER_1_ID },
    });
  });

  describe('1. Reversión Total (Rollback) en TagsService.resolveUid (RF-28, RF-56)', () => {
    it('debe revertir (rollback) AccessLog y ClinicOwner en PostgreSQL real si falla la concesión del AccessGrant', async () => {
      // 1. Estado inicial en PostgreSQL: cero trazas para esta operación
      const logsBefore = await prisma.accessLog.count({ where: { petId: PET_1_ID } });
      const grantsBefore = await prisma.accessGrant.count({ where: { petId: PET_1_ID } });
      const linksBefore = await prisma.clinicOwner.count({
        where: { clinicId: CLINIC_B_ID, ownerId: OWNER_1_ID },
      });

      assert.strictEqual(logsBefore, 0);
      assert.strictEqual(grantsBefore, 0);
      assert.strictEqual(linksBefore, 0);

      // 2. Simular un fallo forzado dentro de la transacción durante la concesión del grant
      const originalGrantAccess = accessGrantsService.grantAccess.bind(accessGrantsService);
      (accessGrantsService as any).grantAccess = async () => {
        throw new Error('Fallo crítico simulado durante la concesión del AccessGrant');
      };

      try {
        // 3. Ejecutar resolveUid: debe fallar y propagar la excepción
        await assert.rejects(
          async () => {
            await tagsService.resolveUid(
              TAG_1_UID,
              CLINIC_B_ID,
              USER_VET_B_ID,
              '192.168.1.50',
              'Mozilla/5.0 Test-Rollback-Terminal',
            );
          },
          /Fallo crítico simulado durante la concesión del AccessGrant/,
          'resolveUid debía fallar por la excepción forzada dentro de la transacción',
        );

        // 4. VERIFICACIÓN DE ROLLBACK REAL EN POSTGRESQL:
        // Ningún registro de AccessLog, ClinicOwner ni AccessGrant debe existir en la base de datos
        const logsAfter = await prisma.accessLog.count({ where: { petId: PET_1_ID } });
        const grantsAfter = await prisma.accessGrant.count({ where: { petId: PET_1_ID } });
        const linksAfter = await prisma.clinicOwner.count({
          where: { clinicId: CLINIC_B_ID, ownerId: OWNER_1_ID },
        });

        assert.strictEqual(
          logsAfter,
          0,
          `Brecha de integridad: AccessLog no fue revertido. Se encontraron ${logsAfter} registros en PostgreSQL tras el fallo.`,
        );
        assert.strictEqual(
          linksAfter,
          0,
          `Brecha de integridad: ClinicOwner no fue revertido. Se encontraron ${linksAfter} registros en PostgreSQL tras el fallo.`,
        );
        assert.strictEqual(
          grantsAfter,
          0,
          `Brecha de integridad: AccessGrant no fue revertido. Se encontraron ${grantsAfter} registros en PostgreSQL tras el fallo.`,
        );
      } finally {
        // Restaurar método original
        accessGrantsService.grantAccess = originalGrantAccess;
      }
    });

    it('debe confirmar la persistencia atómica completa (commit) en PostgreSQL real cuando resolveUid tiene éxito (RF-28, RF-56)', async () => {
      // 1. Ejecutar resolveUid sin fallos simulados
      const result = await tagsService.resolveUid(
        TAG_1_UID,
        CLINIC_B_ID,
        USER_VET_B_ID,
        '192.168.1.50',
        'Mozilla/5.0 Test-Commit-Terminal',
      );

      assert.strictEqual(result.registered, true);
      assert.strictEqual(result.hasFullAccess, true);

      // 2. VERIFICACIÓN DE PERSISTENCIA ATÓMICA EN POSTGRESQL:
      // Deben existir exactamente un AccessLog, un ClinicOwner y un AccessGrant en PostgreSQL
      const persistedLog = await prisma.accessLog.findFirst({
        where: {
          petId: PET_1_ID,
          clinicId: CLINIC_B_ID,
          action: AccessAction.NFC_SCAN,
        },
      });
      assert.ok(persistedLog, 'El AccessLog debe existir en PostgreSQL tras commit exitoso');
      assert.strictEqual(persistedLog.userId, USER_VET_B_ID);

      const persistedLink = await prisma.clinicOwner.findFirst({
        where: {
          clinicId: CLINIC_B_ID,
          ownerId: OWNER_1_ID,
        },
      });
      assert.ok(persistedLink, 'El vínculo ClinicOwner debe existir en PostgreSQL tras commit exitoso');
      assert.strictEqual(persistedLink.status, 'ACTIVE');

      const persistedGrant = await prisma.accessGrant.findFirst({
        where: {
          petId: PET_1_ID,
          clinicId: CLINIC_B_ID,
          scope: GrantScope.FULL_HISTORY,
        },
      });
      assert.ok(persistedGrant, 'El AccessGrant debe existir en PostgreSQL tras commit exitoso');
      assert.strictEqual(persistedGrant.source, GrantSource.NFC_TAP);
    });
  });

  describe('2. Reversión Total (Rollback) por Violación de Restricción de Integridad Referencial (RF-56)', () => {
    it('debe revertir todas las escrituras en PostgreSQL si una inserción posterior viola una restricción de clave foránea', async () => {
      const dummyId = crypto.randomUUID();

      await assert.rejects(
        async () => {
          await prisma.$transaction(async (tx) => {
            // 1. Inserción válida en AccessLog
            await tx.accessLog.create({
              data: {
                id: dummyId,
                petId: PET_1_ID,
                clinicId: CLINIC_A_ID,
                action: AccessAction.HISTORY_VIEW,
                timestamp: new Date(),
              },
            });

            // 2. Inserción deliberadamente inválida violando FK (dueño inexistente en Pet)
            await tx.pet.create({
              data: {
                id: crypto.randomUUID(),
                name: 'Mascota Fantasma Violatoria',
                species: 'CANINE',
                ownerId: '00000000-0000-0000-0000-000000000000', // FK inexistente
              },
            });
          });
        },
        // Esperamos error de base de datos PostgreSQL (P2003 Foreign key constraint failed)
        (err: any) => {
          return err.code === 'P2003' || err.message.includes('Foreign key') || err.message.includes('foreign key');
        },
        'Debía fallar con error de clave foránea de PostgreSQL',
      );

      // 3. Confirmar que el primer registro fue revertido por PostgreSQL (rollback atómico)
      const rolledBackLog = await prisma.accessLog.findUnique({
        where: { id: dummyId },
      });

      assert.strictEqual(
        rolledBackLog,
        null,
        'El registro inicial debió ser revertido por el rollback de PostgreSQL',
      );
    });
  });
});
