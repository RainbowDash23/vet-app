import { describe, it, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
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
  request,
} from './e2e-helper';

describe('E2E: Transaccionalidad Atómica y Reversión Total (Rollback) contra PostgreSQL Real (RF-56)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tagsService: TagsService;
  let accessGrantsService: AccessGrantsService;

  before(async () => {
    process.env.USE_REAL_DB = 'true';

    const rootEnvPath = path.resolve(__dirname, '../../..', '.env');
    const apiEnvPath = path.resolve(__dirname, '..', '.env');
    if (typeof process.loadEnvFile === 'function') {
      if (fs.existsSync(rootEnvPath)) {
        try {
          process.loadEnvFile(rootEnvPath);
        } catch {}
      } else if (fs.existsSync(apiEnvPath)) {
        try {
          process.loadEnvFile(apiEnvPath);
        } catch {}
      }
    }

    const port = process.env.POSTGRES_PORT || '5433';
    const user = process.env.POSTGRES_USER || 'vet_admin';
    const password = process.env.POSTGRES_PASSWORD;
    if (!password) {
      throw new Error(
        'POSTGRES_PASSWORD no está definida en las variables de entorno ni en el archivo .env. Configure POSTGRES_PASSWORD para ejecutar la prueba de reversión contra PostgreSQL real.'
      );
    }
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

  describe('3. Persistencia de mascota sin birthDate en PostgreSQL real (RF-17)', () => {
    it('debe almacenar birthDate como null en PostgreSQL cuando no se proporciona', async () => {
      const petId = crypto.randomUUID();
      const created = await prisma.pet.create({
        data: {
          id: petId,
          name: 'Sombra',
          species: 'FELINE',
          breed: 'Bombay',
          sex: 'MALE',
          ownerId: OWNER_1_ID,
          createdByClinicId: CLINIC_A_ID,
          isApproximateBirthDate: false,
        },
      });

      assert.strictEqual(created.birthDate, null);
      assert.strictEqual(created.isApproximateBirthDate, false);

      const fromDb = await prisma.pet.findUnique({
        where: { id: petId },
      });

      assert.ok(fromDb);
      assert.strictEqual(fromDb.birthDate, null);
      assert.strictEqual(fromDb.isApproximateBirthDate, false);

      // Limpieza
      await prisma.pet.delete({ where: { id: petId } });
    });
  });

  describe('4. Flujo End-to-End en PostgreSQL Real: Dueño, Mascota, Tag, /p/:publicCode y 404 para UID (RF-64)', () => {
    it('debe crear dueño, mascota, asignar tag, retornar 200 HTML en /p/:publicCode y 404 para el UID físico', async () => {
      const ownerId = crypto.randomUUID();
      const petId = crypto.randomUUID();
      const testUid = '04EE' + Date.now().toString(16).slice(-8).toUpperCase();

      // 1. Crear dueño en PostgreSQL real
      const owner = await prisma.owner.create({
        data: {
          id: ownerId,
          documentId: 'DOC-REAL-' + Date.now().toString().slice(-6),
          name: 'Roberto',
          lastName: 'Gómez',
          phone: '+593912345678',
          email: 'roberto.' + Date.now() + '@example.com',
          address: 'Av. Amazonas 1234',
        },
      });

      // 2. Crear mascota en PostgreSQL real
      const pet = await prisma.pet.create({
        data: {
          id: petId,
          name: 'Zeus',
          species: 'CANINE',
          breed: 'Dóberman',
          sex: 'MALE',
          birthDate: new Date('2022-01-15T00:00:00.000Z'),
          color: 'Negro y Fuego',
          ownerId: owner.id,
          createdByClinicId: CLINIC_A_ID,
          isApproximateBirthDate: false,
        },
      });

      // 3. Asignar tag NFC
      const tag = await tagsService.assignTag({ petId: pet.id, uid: testUid }, CLINIC_A_ID);
      assert.ok(tag.id, 'Tag debe tener id');
      assert.strictEqual(tag.uid, testUid);
      assert.ok(tag.publicCode, 'Tag debe generar publicCode');

      // 4. GET /p/:publicCode -> debe responder 200 con HTML de la mascota
      const emergencyRes = await request(app.getHttpServer()).get('/p/' + tag.publicCode);
      assert.strictEqual(emergencyRes.status, 200);
      assert.ok(
        emergencyRes.headers['content-type']?.includes('text/html'),
        'Debe responder con text/html',
      );
      assert.ok(emergencyRes.text.includes('Zeus'), 'HTML debe mostrar nombre de la mascota');
      assert.ok(emergencyRes.text.includes('Roberto Gómez'), 'HTML debe mostrar nombre del dueño');
      assert.ok(emergencyRes.text.includes('+593912345678'), 'HTML debe mostrar teléfono del dueño');
      assert.strictEqual(
        emergencyRes.text.includes('Av. Amazonas 1234'),
        false,
        'HTML NO debe exponer la dirección física del dueño',
      );

      // 5. GET /p/<UID> -> debe responder 404 (el UID físico NUNCA debe resolver la página pública)
      const uidRes = await request(app.getHttpServer()).get('/p/' + testUid);
      assert.strictEqual(uidRes.status, 404, 'El UID físico debe responder 404 en el portal público');
      assert.ok(
        uidRes.text.toLowerCase().includes('no encontrad') ||
          uidRes.text.toLowerCase().includes('404'),
        'Debe devolver página 404',
      );

      // 6. Aislamiento de tags por clínica (cross-tenant 404)
      const ownerClinicTags = await tagsService.findByPetId(pet.id, CLINIC_A_ID);
      assert.strictEqual(ownerClinicTags.length, 1);
      assert.strictEqual(ownerClinicTags[0].publicCode, tag.publicCode);

      await assert.rejects(
        async () => tagsService.findByPetId(pet.id, CLINIC_B_ID),
        (err) => {
          const e = err as Error;
          assert.strictEqual(e.name, 'NotFoundException');
          assert.ok(e.message?.includes('no encontrados o no autorizados'));
          return true;
        },
      );

      // 7. Limpieza en PostgreSQL real
      await prisma.tag.deleteMany({ where: { petId: pet.id } });
      await prisma.pet.delete({ where: { id: pet.id } });
      await prisma.owner.delete({ where: { id: owner.id } });
    });
  });
});
