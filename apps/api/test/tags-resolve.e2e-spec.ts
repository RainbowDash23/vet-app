import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { AccessAction, GrantScope, GrantSource, TagStatus } from '@prisma/client';
import {
  createTestApp,
  SEED_PASSWORDS,
  CLINIC_A_ID,
  CLINIC_B_ID,
  OWNER_1_ID,
  PET_1_ID,
  TAG_1_UID,
  InMemoryDb,
  request,
} from './e2e-helper';

describe('E2E: Subsistema de Tags NFC y Resolución de Consentimientos (tags-resolve.e2e-spec.ts)', () => {
  let app: INestApplication;
  let db: InMemoryDb;
  let receptionToken: string;
  let vetBToken: string;
  const PET_2_ID = 'ffffffff-2222-4222-8222-ffffffffffff';

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;

    // Login recepción de Clínica A
    const recRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'reception@vetapp.com',
        password: SEED_PASSWORDS.reception,
      });
    assert.strictEqual(recRes.status, 200);
    receptionToken = recRes.body.accessToken;

    // Login veterinario de Clínica B
    const vetBRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'vet2@vetapp.com',
        password: SEED_PASSWORDS.vetB,
      });
    assert.strictEqual(vetBRes.status, 200);
    vetBToken = vetBRes.body.accessToken;

    // Registrar una segunda mascota sin tag asignado para probar asignación exitosa
    db.pets.push({
      id: PET_2_ID,
      name: 'Luna',
      species: 'FELINE',
      breed: 'Siamés',
      birthDate: new Date('2021-03-15'),
      reproductiveStatus: 'SPAYED',
      sex: 'FEMALE',
      ownerId: OWNER_1_ID,
      createdByClinicId: CLINIC_A_ID,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. GET /tags/resolve/:uid con Tag Activo (RF-28, RF-56)', () => {
    it('debe resolver el tag, registrar traza inmutable en AccessLog (NFC_SCAN) y conceder AccessGrant de 24h a la clínica', async () => {
      const logsCountBefore = db.accessLogs.length;
      const grantsCountBefore = db.accessGrants.length;

      // Clínica B escanea el llavero de la mascota (TAG_1_UID)
      const res = await request(app.getHttpServer())
        .get(`/tags/resolve/${TAG_1_UID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.registered, true);
      assert.strictEqual(res.body.uid, TAG_1_UID);
      assert.strictEqual(res.body.hasFullAccess, true);
      assert.ok(res.body.pet, 'Debe incluir la información de la mascota');
      assert.strictEqual(res.body.pet.id, PET_1_ID);
      assert.strictEqual(res.body.pet.name, 'Max');
      assert.ok(res.body.grant, 'Debe incluir el AccessGrant generado');

      // 1. Verificar inserción atómica en AccessLog con acción NFC_SCAN
      assert.strictEqual(db.accessLogs.length, logsCountBefore + 1);
      const newLog = db.accessLogs[db.accessLogs.length - 1];
      assert.strictEqual(newLog.action, AccessAction.NFC_SCAN);
      assert.strictEqual(newLog.petId, PET_1_ID);
      assert.strictEqual(newLog.clinicId, CLINIC_B_ID);

      // 2. Verificar emisión atómica de AccessGrant de 24 horas a favor de Clínica B
      assert.strictEqual(db.accessGrants.length, grantsCountBefore + 1);
      const newGrant = db.accessGrants[db.accessGrants.length - 1];
      assert.strictEqual(newGrant.petId, PET_1_ID);
      assert.strictEqual(newGrant.clinicId, CLINIC_B_ID);
      assert.strictEqual(newGrant.source, GrantSource.NFC_TAP);
      assert.strictEqual(newGrant.scope, GrantScope.FULL_HISTORY);

      const grantExpiresAt = new Date(newGrant.expiresAt).getTime();
      const nowMs = Date.now();
      const diffHours = (grantExpiresAt - nowMs) / (1000 * 3600);
      assert.ok(
        diffHours >= 23.9 && diffHours <= 24.1,
        `La vigencia del grant debe ser de ~24 horas (actual: ${diffHours}h)`,
      );
    });
  });

  describe('2. GET /tags/resolve/:uid con Tag no Asignado o Inexistente (RF-29)', () => {
    it('debe responder con HTTP 404 y cuerpo { registered: false, uid } ante UID no registrado', async () => {
      const unknownUid = 'A1B2C3D4E5F6';

      const res = await request(app.getHttpServer())
        .get(`/tags/resolve/${unknownUid}`)
        .set('Authorization', `Bearer ${receptionToken}`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.registered, false);
      assert.strictEqual(res.body.uid, unknownUid);
    });
  });

  describe('3. POST /tags/assign - Asignación de Tags y Control de Unicidad (RF-30, RF-31)', () => {
    it('debe vincular exitosamente un tag nuevo a una mascota sin tag activo y generar publicCode único', async () => {
      const newUid = '112233445566';

      const res = await request(app.getHttpServer())
        .post('/tags/assign')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          uid: newUid,
          petId: PET_2_ID,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.uid, newUid);
      assert.strictEqual(res.body.petId, PET_2_ID);
      assert.strictEqual(res.body.status, TagStatus.ACTIVE);
      assert.ok(res.body.publicCode, 'Debe generar un publicCode UUID v4 único');
    });

    it('debe rechazar con HTTP 409 Conflict si el UID ya se encuentra activo en el sistema (RF-31)', async () => {
      // Intentar asignar TAG_1_UID (ya activo en PET_1) a otra mascota
      const anotherPetId = crypto.randomUUID();
      db.pets.push({
        id: anotherPetId,
        name: 'Rocky',
        species: 'CANINE',
        breed: 'Bulldog',
        birthDate: new Date('2022-01-01'),
        reproductiveStatus: 'INTACT',
        sex: 'MALE',
        ownerId: OWNER_1_ID,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/tags/assign')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          uid: TAG_1_UID, // UID duplicado
          petId: anotherPetId,
        });

      assert.strictEqual(res.status, 409);
      assert.ok(
        res.body.message.includes('ya se encuentra asignado') ||
          res.body.message.includes('activo') ||
          res.body.statusCode === 409,
      );
    });

    it('debe rechazar con HTTP 409 Conflict si la mascota ya posee otro tag en estado ACTIVE (RF-31)', async () => {
      // PET_1_ID ya tiene TAG_1_UID activo. Intentamos asignarle un nuevo UID
      const brandNewUid = '998877665544';

      const res = await request(app.getHttpServer())
        .post('/tags/assign')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          uid: brandNewUid,
          petId: PET_1_ID, // Mascota con tag activo
        });

      assert.strictEqual(res.status, 409);
      assert.ok(
        res.body.message.includes('ya tiene un tag activo') ||
          res.body.statusCode === 409,
      );
    });
  });
});
