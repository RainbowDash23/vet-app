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

describe('5. Portal Público de Rescate SSR HTML (RF-64)', () => {
    it('debe responder HTML sanitizado y escapar caracteres para prevenir XSS en el nombre de la mascota (<script>)', async () => {
      const xssPetId = crypto.randomUUID();
      const xssCode = crypto.randomUUID();

      db.pets.push({
        id: xssPetId,
        name: '<script>alert("XSS")</script>',
        species: 'FELINE',
        breed: 'Siames',
        birthDate: new Date('2020-01-01'),
        reproductiveStatus: 'INTACT',
        sex: 'FEMALE',
        ownerId: OWNER_1_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'XSS001122334',
        publicCode: xssCode,
        status: TagStatus.ACTIVE,
        petId: xssPetId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer()).get(`/p/${xssCode}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['content-type']?.includes('text/html'), 'Debe responder con text/html');
      assert.ok(
        res.text.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;') ||
          res.text.includes('&lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;') ||
          res.text.includes('&lt;script&gt;'),
        'El nombre de la mascota debe estar sanitizado contra XSS',
      );
      assert.strictEqual(
        res.text.includes('<script>alert("XSS")</script>'),
        false,
        'No debe contener el script sin escapar',
      );
      assert.strictEqual(res.text.includes('<script'), false, 'No debe contener tags script ejecutables');
    });

    it('debe responder HTTP 404 con página HTML amigable ante publicCode inexistente o tag inactivo', async () => {
      const nonExistentCode = crypto.randomUUID();
      const res = await request(app.getHttpServer()).get(`/p/${nonExistentCode}`);

      assert.strictEqual(res.status, 404);
      assert.ok(res.headers['content-type']?.includes('text/html'), 'Debe responder con text/html');
      assert.ok(
        res.text.toLowerCase().includes('no encontrad') ||
          res.text.toLowerCase().includes('inactiv') ||
          res.text.toLowerCase().includes('404'),
        'Debe incluir mensaje amigable de no encontrado o inactivo',
      );
    });

    it('debe responder HTTP 429 tras superar el límite del throttler', async () => {
      let throttled = false;
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .get(`/p/${TAG_1_PUBLIC_CODE}`)
          .set('x-forwarded-for', '203.0.113.199');
        if (res.status === 429) {
          throttled = true;
          break;
        }
      }
      assert.strictEqual(throttled, true, 'Debe responder HTTP 429 Too Many Requests tras superar el límite');
    });

    it('debe comprobar que el HTML no expone cédula, email ni dirección física del dueño', async () => {
      const owner = db.owners.find((o) => o.id === OWNER_1_ID);
      assert.ok(owner, 'Dueño 1 debe existir');

      const res = await request(app.getHttpServer()).get(`/p/${TAG_1_PUBLIC_CODE}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('Max'), 'Debe contener nombre de la mascota');
      assert.ok(res.text.includes('Carlos Mendoza'), 'Debe contener nombre del dueño');
      assert.ok(res.text.includes('+593991234567'), 'Debe contener teléfono del dueño');

      if (owner.documentId) {
        assert.strictEqual(
          res.text.includes(owner.documentId),
          false,
          'El HTML no debe contener el documentId del dueño',
        );
      }
      if (owner.email) {
        assert.strictEqual(
          res.text.includes(owner.email),
          false,
          'El HTML no debe contener el email del dueño',
        );
      }
      if (owner.address) {
        assert.strictEqual(
          res.text.includes(owner.address),
          false,
          'El HTML no debe contener la dirección del dueño',
        );
      }
    });

    it('debe contener el título exacto, etiquetas Open Graph sin datos personales y atributo lang="es"', async () => {
      const res = await request(app.getHttpServer()).get(`/p/${TAG_1_PUBLIC_CODE}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('<html lang="es">'), 'Debe incluir lang="es" en el tag html');
      assert.ok(
        res.text.includes('<title>Mascota registrada - contacto de emergencia</title>'),
        'El título de la página debe ser exactamente "Mascota registrada - contacto de emergencia"',
      );
      assert.ok(
        res.text.includes('<meta property="og:title" content="Mascota registrada - contacto de emergencia">'),
        'Debe incluir meta og:title estándar',
      );
      assert.ok(
        res.text.includes('<meta property="og:description" content="Portal público de contacto de emergencia para mascotas registradas.">'),
        'Debe incluir meta og:description sin datos personales',
      );
    });
  });
});
