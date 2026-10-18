import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { AccessAction, TagStatus } from '@prisma/client';
import {
  createTestApp,
  PET_1_ID,
  TAG_1_PUBLIC_CODE,
  OWNER_1_ID,
  InMemoryDb,
  request,
} from './e2e-helper';

describe('E2E: Portal Público de Contingencia y Rescate (emergency.e2e-spec.ts)', () => {
  let app: INestApplication;
  let db: InMemoryDb;

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Acceso Público sin Autenticación JWT (RF-35)', () => {
    it('GET /emergency/:publicCode debe ser accesible públicamente sin cabecera Authorization', async () => {
      const res = await request(app.getHttpServer())
        .get(`/emergency/${TAG_1_PUBLIC_CODE}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body);
    });
  });

  describe('2. Sanitización Estricta y Censura de Datos Confidenciales (RF-36)', () => {
    it('debe retornar únicamente datos mínimos de filiación y contacto, censurando dirección, historial, notas o diagnósticos', async () => {
      const res = await request(app.getHttpServer())
        .get(`/emergency/${TAG_1_PUBLIC_CODE}`);

      assert.strictEqual(res.status, 200);

      // Datos públicos permitidos conforme a RF-36
      assert.strictEqual(res.body.petName, 'Max');
      assert.strictEqual(res.body.species, 'CANINE');
      assert.strictEqual(res.body.breed, 'Golden Retriever');
      assert.strictEqual(res.body.ownerName, 'Carlos Mendoza');
      assert.strictEqual(res.body.ownerPhone, '+593991234567');
      assert.strictEqual(res.body.clinicName, 'Clínica Veterinaria Central');
      assert.strictEqual(res.body.clinicPhone, '+1234567890');

      // Censura estricta de dirección y datos clínicos confidenciales
      assert.strictEqual(
        res.body.address,
        undefined,
        'La dirección física del propietario no debe exponerse',
      );
      assert.strictEqual(
        res.body.ownerAddress,
        undefined,
        'La dirección no debe exponerse bajo ninguna clave',
      );
      assert.strictEqual(
        res.body.visits,
        undefined,
        'El historial de visitas no debe exponerse',
      );
      assert.strictEqual(
        res.body.notes,
        undefined,
        'Las notas clínicas no deben exponerse',
      );
      assert.strictEqual(
        res.body.diagnosis,
        undefined,
        'Los diagnósticos no deben exponerse',
      );
      assert.strictEqual(
        res.body.anamnesis,
        undefined,
        'La anamnesis no debe exponerse',
      );
      assert.strictEqual(
        res.body.treatment,
        undefined,
        'Los tratamientos no deben exponerse',
      );
    });
  });

  describe('3. Registro Inmutable en AccessLog con EMERGENCY_SCAN (RF-37)', () => {
    it('debe registrar traza inmutable consignando acción EMERGENCY_SCAN e IP del visitante, con clinicId y userId nulos', async () => {
      const visitorIp = '198.51.100.77';
      const logsCountBefore = db.accessLogs.length;

      const res = await request(app.getHttpServer())
        .get(`/emergency/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', visitorIp)
        .set('user-agent', 'Mozilla/5.0 (Emergency Rescue Scanner)');

      assert.strictEqual(res.status, 200);

      assert.strictEqual(db.accessLogs.length, logsCountBefore + 1);
      const emergencyLog = db.accessLogs[db.accessLogs.length - 1];

      assert.strictEqual(emergencyLog.action, AccessAction.EMERGENCY_SCAN);
      assert.strictEqual(emergencyLog.petId, PET_1_ID);
      assert.strictEqual(emergencyLog.ipAddress, visitorIp);
      assert.strictEqual(emergencyLog.clinicId, null);
      assert.strictEqual(emergencyLog.userId, null);
      assert.ok(emergencyLog.timestamp instanceof Date);
    });
  });

  describe('4. Respuestas HTTP 404 Not Found ante Códigos o Estados Inválidos (RF-38)', () => {
    it('debe retornar HTTP 404 ante UUID publicCode inexistente', async () => {
      const nonExistentCode = '00000000-0000-4000-8000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/emergency/${nonExistentCode}`);

      assert.strictEqual(res.status, 404);
      assert.ok(
        res.body.message.includes('no encontrado') ||
          res.body.message.includes('inactivo') ||
          res.body.statusCode === 404,
      );
    });

    it('debe retornar HTTP 404 ante código con formato no-UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/emergency/not-a-valid-uuid-code');

      assert.strictEqual(res.status, 404);
    });

    it('debe retornar HTTP 404 si el tag se encuentra en estado LOST', async () => {
      const lostCode = crypto.randomUUID();
      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'LOST00112233',
        publicCode: lostCode,
        status: TagStatus.LOST,
        petId: PET_1_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/emergency/${lostCode}`);

      assert.strictEqual(res.status, 404);
    });

    it('debe retornar HTTP 404 si el tag se encuentra en estado DAMAGED', async () => {
      const damagedCode = crypto.randomUUID();
      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'DAMAGED00112',
        publicCode: damagedCode,
        status: TagStatus.DAMAGED,
        petId: PET_1_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/emergency/${damagedCode}`);

      assert.strictEqual(res.status, 404);
    });

    it('debe retornar HTTP 404 si el tag se encuentra en estado INACTIVE', async () => {
      const inactiveCode = crypto.randomUUID();
      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'INACT0011223',
        publicCode: inactiveCode,
        status: TagStatus.INACTIVE,
        petId: PET_1_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/emergency/${inactiveCode}`);

      assert.strictEqual(res.status, 404);
    });

    it('debe retornar HTTP 404 si la mascota vinculada presenta borrado lógico', async () => {
      const deletedPetId = crypto.randomUUID();
      const deletedPetCode = crypto.randomUUID();

      db.pets.push({
        id: deletedPetId,
        name: 'Toby',
        species: 'CANINE',
        breed: 'Poodle',
        birthDate: new Date('2019-01-01'),
        reproductiveStatus: 'INTACT',
        sex: 'MALE',
        ownerId: OWNER_1_ID,
        deletedAt: new Date(), // Borrado lógico
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'DELPET001122',
        publicCode: deletedPetCode,
        status: TagStatus.ACTIVE,
        petId: deletedPetId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/emergency/${deletedPetCode}`);

      assert.strictEqual(res.status, 404);
    });
  });
});
