import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { AccessAction, Role, TagStatus, VisitStatus } from '@prisma/client';
import {
  createTestApp,
  SEED_PASSWORDS,
  CLINIC_A_ID,
  CLINIC_B_ID,
  USER_ADMIN_ID,
  USER_VET_A_ID,
  USER_VET_B_ID,
  OWNER_1_ID,
  PET_1_ID,
  TAG_1_UID,
  InMemoryDb,
  request,
} from './e2e-helper';

/**
 * Suite de pruebas de seguridad y aislamiento multi-tenant (access-policy-leaks.e2e-spec.ts).
 * 
 * Estas pruebas validan la política estricta de acceso formalizada en specs/spec.md (Sección 4.12, RF-58 a RF-63).
 * CON EL CÓDIGO ACTUAL, ESTAS PRUEBAS DEBEN FALLAR (TESTS ROJOS), demostrando empíricamente
 * las 12 fugas de datos y brechas de aislamiento multi-tenant identificadas:
 * 1. Fuga 1: GET /visits/:id de otra clínica (espera 404, actualmente devuelve 200).
 * 2. Fuga 2: GET /pets/:id sin grant expone documentId, email, address del dueño y notes clínicas (espera undefined).
 * 3. Fuga 3: GET /owners incluye dueños de otra clínica (espera exclusión).
 * 4. Fuga 4: GET /tags/pet/:petId de otra clínica sin grant (espera 404, actualmente devuelve 200).
 * 5. Fuga 5: GET /audit/access-logs por ADMIN de Clínica B ve trazas de Clínica A (espera 0 trazas ajenas).
 * 6. Fuga 6: PATCH /pets/:id de otra clínica (espera 404, actualmente devuelve 200).
 * 7. Fuga 7: PATCH /tags/:id/status de otra clínica (espera 404, actualmente devuelve 200).
 * 8. Fuga 8: DELETE /attachments/:id de otra clínica (espera 404, actualmente devuelve 200).
 * 9. Fuga 9: GET /clinics/:id de otra clínica por ADMIN (espera 404, actualmente devuelve 200).
 * 10. Fuga 10: PATCH /clinics/:id de otra clínica por ADMIN (espera 404, actualmente devuelve 200).
 * 11. Fuga 11: POST /attachments con petId o visitId ajeno sin grant (espera 404, actualmente devuelve 201).
 * 12. Fuga 12: POST /vaccinations con petId ajeno sin vínculo ni grant (espera 404, actualmente devuelve 201).
 */
describe('E2E: Demostración de Fugas de Seguridad y Aislamiento Multi-Tenant (specs/spec.md RF-58 a RF-63)', () => {
  let app: INestApplication;
  let db: InMemoryDb;
  let vetBToken: string;
  let adminBToken: string;
  let adminAToken: string;
  let testContext: any;
  const visitClinicAId = '33333333-aaaa-4333-8333-333333333333';
  const tagClinicAId = 'tag-1111-4111-8111-111111111111';
  const attachmentClinicAId = 'attachment-clinic-a-confidential-001';

  before(async () => {
    testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;

    // Login Administrador de Clínica A
    const loginAdminA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@vetapp.com',
        password: SEED_PASSWORDS.admin,
      });
    assert.strictEqual(loginAdminA.status, 200);
    adminAToken = loginAdminA.body.accessToken;

    // Asignar notas clínicas confidenciales a la mascota de Clínica A
    const pet1 = db.pets.find((p) => p.id === PET_1_ID);
    if (pet1) {
      pet1.notes = 'Historial confidencial de alergias severas y diagnóstico reservado de Clínica A';
    }

    // Crear un usuario ADMIN para la Clínica B en la base de datos
    const USER_ADMIN_B_ID = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
    const adminBPass = 'AdminBPass123!';
    const adminBHash = require('bcryptjs').hashSync(adminBPass, 10);

    db.users.push({
      id: USER_ADMIN_B_ID,
      email: 'admin2@hospitalvet24.com',
      password: adminBHash,
      name: 'Dr. Administrador Hospital 24H',
      role: Role.ADMIN,
      clinicId: CLINIC_B_ID,
      licenseNumber: null,
      phone: '+1234567895',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (testContext.syncToPostgres) {
      await testContext.syncToPostgres();
    }

    // Login Veterinario de Clínica B
    const loginVetB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'vet2@vetapp.com',
        password: SEED_PASSWORDS.vetB,
      });
    assert.strictEqual(loginVetB.status, 200);
    vetBToken = loginVetB.body.accessToken;

    // Login Administrador de Clínica B
    const loginAdminB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin2@hospitalvet24.com',
        password: adminBPass,
      });
    assert.strictEqual(loginAdminB.status, 200);
    adminBToken = loginAdminB.body.accessToken;

    // Sembrar una visita confidencial en Clínica A con diagnóstico y anamnesis médica
    db.visits.push({
      id: visitClinicAId,
      clinicId: CLINIC_A_ID,
      vetId: USER_VET_A_ID,
      petId: PET_1_ID,
      scheduledDate: new Date('2026-11-01T10:00:00.000Z'),
      durationMinutes: 30,
      reason: 'Consulta general confidencial en Clínica A',
      status: VisitStatus.SCHEDULED,
      notes: 'Nota privada interna de Clínica A',
      diagnosis: 'Diagnóstico reservado de Clínica A',
      treatment: 'Tratamiento exclusivo indicado por Clínica A',
      deletedAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Sembrar un archivo clínico adjunto confidencial en Clínica A
    db.attachments.push({
      id: attachmentClinicAId,
      filename: 'ecografia_cardiaca_confidencial.pdf',
      storagePath: 'uploads/attachments/confidential_eco.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 1024 * 2,
      description: 'Ecografía cardíaca diagnóstica privada efectuada en Clínica A',
      uploadedById: USER_VET_A_ID,
      petId: PET_1_ID,
      visitId: visitClinicAId,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Sembrar una traza de auditoría de consulta médica originada en Clínica A
    db.accessLogs.push({
      id: crypto.randomUUID(),
      petId: PET_1_ID,
      clinicId: CLINIC_A_ID,
      userId: USER_ADMIN_ID,
      action: AccessAction.HISTORY_VIEW,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Clinica-A-Terminal',
      timestamp: new Date(),
    });

    if (testContext.syncToPostgres) {
      await testContext.syncToPostgres();
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Fuga 1: Usuario de Clínica B lee GET /visits/:id de Clínica A (RF-58)', () => {
    it('debe denegar con HTTP 404 Not Found cuando un usuario de Clínica B intenta leer una visita de Clínica A', async () => {
      const res = await request(app.getHttpServer())
        .get(`/visits/${visitClinicAId}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(
        res.status,
        404,
        `Brecha de aislamiento: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo leer la visita de Clínica A.`,
      );
    });
  });

  describe('Fuga 2: Usuario consulta GET /pets/:id sin AccessGrant activo (RF-59)', () => {
    it('debe omitir documentId, email, address del dueño y notes clínicas al consultar GET /pets/:id sin consentimiento', async () => {
      const res = await request(app.getHttpServer())
        .get(`/pets/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 200);

      assert.strictEqual(
        res.body.owner?.address,
        undefined,
        `Fuga de privacidad: Se expuso la dirección física confidencial del dueño sin AccessGrant: "${res.body.owner?.address}"`,
      );
      assert.strictEqual(
        res.body.owner?.documentId,
        undefined,
        `Fuga de privacidad: Se expuso el documento de identidad confidencial del dueño sin AccessGrant: "${res.body.owner?.documentId}"`,
      );
      assert.strictEqual(
        res.body.owner?.email,
        undefined,
        `Fuga de privacidad: Se expuso el correo electrónico confidencial del dueño sin AccessGrant: "${res.body.owner?.email}"`,
      );
      assert.strictEqual(
        res.body.notes,
        undefined,
        `Fuga de privacidad: Se expusieron las notas médicas confidenciales del paciente sin AccessGrant: "${res.body.notes}"`,
      );
    });
  });

  describe('Fuga 3: Usuario de Clínica B lista GET /owners de otras clínicas (RF-60)', () => {
    it('no debe incluir dueños exclusivos de Clínica A en el listado general GET /owners de Clínica B', async () => {
      const res = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 200);

      const ownerIds = res.body.data.map((owner: any) => owner.id);
      assert.strictEqual(
        ownerIds.includes(OWNER_1_ID),
        false,
        `Brecha multi-tenant: Clínica B pudo listar al dueño ${OWNER_1_ID} cuyos pacientes pertenecen exclusivamente a Clínica A.`,
      );
    });
  });

  describe('Fuga 4: Usuario consulta GET /tags/pet/:petId de otra clínica sin AccessGrant (RF-61)', () => {
    it('debe denegar con HTTP 404 Not Found la consulta de tags de una mascota ajena sin consentimiento activo', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tags/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(
        res.status,
        404,
        `Brecha de seguridad: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo inspeccionar los tags de la mascota ajena.`,
      );
    });
  });

  describe('Fuga 5: ADMIN de Clínica B consulta GET /audit/access-logs de otra clínica (RF-62)', () => {
    it('no debe retornar trazas de auditoría de Clínica A cuando consulta el ADMIN de Clínica B', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit/access-logs')
        .set('Authorization', `Bearer ${adminBToken}`);

      assert.strictEqual(res.status, 200);

      const foreignLogs = res.body.data.filter((log: any) => log.clinicId === CLINIC_A_ID);
      assert.strictEqual(
        foreignLogs.length,
        0,
        `Fuga de auditoría: ADMIN de Clínica B pudo ver ${foreignLogs.length} traza(s) de auditoría pertenecientes a Clínica A.`,
      );
    });
  });

  describe('Fuga 6: Usuario de Clínica B muta datos de paciente ajeno vía PATCH /pets/:id (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found la modificación de una mascota de Clínica A desde Clínica B', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pets/${PET_1_ID}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          name: 'Max Modificado Ilegítimamente Por Clínica B',
        });

      assert.strictEqual(
        res.status,
        404,
        `Brecha de mutación: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo modificar una mascota de Clínica A.`,
      );
    });
  });

  describe('Fuga 7: Usuario de Clínica B altera estado de tag ajeno vía PATCH /tags/:id/status (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found la alteración de estado de un tag de Clínica A desde Clínica B', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tags/${tagClinicAId}/status`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          status: TagStatus.DAMAGED,
        });

      assert.strictEqual(
        res.status,
        404,
        `Brecha de mutación: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo alterar el estado de un tag de Clínica A.`,
      );
    });
  });

  describe('Fuga 8: Usuario de Clínica B elimina archivo adjunto clínico vía DELETE /attachments/:id (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found el borrado de un archivo clínico de Clínica A desde Clínica B', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/attachments/${attachmentClinicAId}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(
        res.status,
        404,
        `Brecha de eliminación: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo eliminar un archivo clínico de Clínica A.`,
      );
    });
  });

  describe('Fuga 9: ADMIN de Clínica B consulta GET /clinics/:id de Clínica A (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found cuando un ADMIN intenta consultar otra clínica por ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/clinics/${CLINIC_A_ID}`)
        .set('Authorization', `Bearer ${adminBToken}`);

      // POLÍTICA RF-63: Un ADMIN solo puede consultar los datos de su propia clínica (id === session.clinicId).
      // Clínicas ajenas deben responder HTTP 404 Not Found.
      // FALLO ACTUAL: La API responde HTTP 200 OK y entrega la información institucional de Clínica A.
      assert.strictEqual(
        res.status,
        404,
        `Brecha multi-tenant: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. ADMIN de Clínica B pudo consultar los datos de Clínica A.`,
      );
    });
  });

  describe('Fuga 10: ADMIN de Clínica B modifica PATCH /clinics/:id de Clínica A (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found cuando un ADMIN intenta modificar otra clínica por ID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/clinics/${CLINIC_A_ID}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          name: 'Clínica A Modificada Ilegítimamente',
        });

      // POLÍTICA RF-63: Un ADMIN solo puede actualizar su propia clínica (id === session.clinicId).
      // Clínicas ajenas deben responder HTTP 404 Not Found.
      // FALLO ACTUAL: La API responde HTTP 200 OK y muta el nombre de Clínica A en la base de datos.
      assert.strictEqual(
        res.status,
        404,
        `Brecha multi-tenant: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. ADMIN de Clínica B pudo modificar los datos de Clínica A.`,
      );
    });
  });

  describe('Fuga 11: Usuario de Clínica B sube POST /attachments con petId o visitId ajeno (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found la subida de adjuntos para una mascota o visita de Clínica A sin grant', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 Archivo de prueba no autorizado');
      const res = await request(app.getHttpServer())
        .post('/attachments')
        .set('Authorization', `Bearer ${vetBToken}`)
        .attach('file', pdfBuffer, 'analisis_no_autorizado.pdf')
        .field('petId', PET_1_ID)
        .field('visitId', visitClinicAId)
        .field('description', 'Intento de adjunto cruzado no autorizado');

      // POLÍTICA RF-63: No se permite vincular adjuntos a mascotas o visitas de otra clínica sin consentimiento activo.
      // Recursos ajenos devuelven HTTP 404 Not Found.
      // FALLO ACTUAL: La API responde HTTP 201 Created y almacena el adjunto en la visita ajena.
      assert.strictEqual(
        res.status,
        404,
        `Brecha multi-tenant: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo asociar un adjunto a la visita de Clínica A.`,
      );
    });
  });

  describe('Fuga 12: Veterinario de Clínica B registra POST /vaccinations en paciente ajeno sin vínculo ni grant (RF-63)', () => {
    it('debe denegar con HTTP 404 Not Found la aplicación de vacunas sobre una mascota ajena sin consentimiento', async () => {
      const res = await request(app.getHttpServer())
        .post('/vaccinations')
        .set('Authorization', `Bearer ${vetBToken}`)
        .send({
          petId: PET_1_ID,
          vaccineName: 'Antirrábica Canina Ilegítima',
          appliedAt: new Date().toISOString(),
          nextDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

      // POLÍTICA RF-63: No se permite registrar aplicaciones biológicas en pacientes ajenos sin vínculo ni grant.
      // Paciente ajeno devuelve HTTP 404 Not Found.
      // FALLO ACTUAL: La API responde HTTP 201 Created y persiste la vacunación en el paciente ajeno.
      assert.strictEqual(
        res.status,
        404,
        `Brecha multi-tenant: Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo registrar una vacunación en la mascota de Clínica A.`,
      );
    });
  });

  describe('Prueba Uno: Alta de dueño en Clínica B, visibilidad y creación de mascota con provenance (RF-60, RF-63)', () => {
    it('debe registrar createdByClinicId y ClinicOwner al crear dueño con POST /owners, listarlo en GET /owners y permitir crear mascota', async () => {
      // 1. Clínica B crea un nuevo dueño
      const createOwnerRes = await request(app.getHttpServer())
        .post('/owners')
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          documentId: 'DOC-B-999999',
          name: 'Pedro',
          lastName: 'Pascal',
          phone: '+593988888888',
          email: 'pedro.pascal@hospitalvet24.com',
          address: 'Av. Las Palmas 555',
        });

      assert.strictEqual(createOwnerRes.status, 201);
      const ownerBId = createOwnerRes.body.id;
      assert.ok(ownerBId);
      assert.strictEqual(createOwnerRes.body.createdByClinicId, CLINIC_B_ID);

      // 2. Clínica B lo ve en GET /owners
      const listBRes = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${adminBToken}`);
      assert.strictEqual(listBRes.status, 200);
      const foundInB = listBRes.body.data.some((o: any) => o.id === ownerBId);
      assert.strictEqual(foundInB, true, 'El dueño creado por Clínica B debe aparecer en su listado GET /owners');

      // 3. Clínica A NO lo ve en GET /owners
      const listARes = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${adminAToken}`);
      assert.strictEqual(listARes.status, 200);
      const foundInA = listARes.body.data.some((o: any) => o.id === ownerBId);
      assert.strictEqual(foundInA, false, 'El dueño creado por Clínica B no debe aparecer en el listado de Clínica A');

      // 4. Clínica B puede crear su mascota
      const createPetRes = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          name: 'Thor',
          species: 'CANINE',
          breed: 'Pastor Alemán',
          sex: 'MALE',
          birthDate: '2023-01-01T00:00:00.000Z',
          ownerId: ownerBId,
        });
      assert.strictEqual(createPetRes.status, 201);
      assert.strictEqual(createPetRes.body.createdByClinicId, CLINIC_B_ID);

      // 5. Clínica A NO puede crear mascota para un dueño ajeno sin vínculo
      const createPetByAFails = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          name: 'Mascota Inválida',
          species: 'CANINE',
          birthDate: '2023-01-01T00:00:00.000Z',
          ownerId: ownerBId,
        });
      assert.strictEqual(createPetByAFails.status, 404);
    });
  });

  describe('Prueba Dos: POST /owners/lookup no expone datos personales y responde 429 tras límite (RF-60)', () => {
    it('debe responder { exists: true, pendingConsent: true } sin datos personales y devolver HTTP 429 tras superar el límite', async () => {
      // 1. Consulta ciega de dueño existente
      const lookupRes = await request(app.getHttpServer())
        .post('/owners/lookup')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ documentId: 'DOC123456' });

      assert.strictEqual(lookupRes.status, 200);
      assert.deepStrictEqual(lookupRes.body, { exists: true, pendingConsent: true });
      assert.strictEqual(lookupRes.body.name, undefined);
      assert.strictEqual(lookupRes.body.email, undefined);
      assert.strictEqual(lookupRes.body.phone, undefined);
      assert.strictEqual(lookupRes.body.address, undefined);
      assert.strictEqual(lookupRes.body.id, undefined);

      // 2. Superar el límite de rate limit (10 peticiones)
      let rateLimited = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer())
          .post('/owners/lookup')
          .set('Authorization', `Bearer ${adminAToken}`)
          .send({ documentId: 'DOC123456' });

        if (res.status === 429) {
          rateLimited = true;
          break;
        }
      }
      assert.strictEqual(rateLimited, true, 'Debe responder HTTP 429 Too Many Requests tras superar el límite');
    });
  });

  describe('Prueba Tres: ClinicOwner se crea únicamente tras escanear el llavero y no antes (RF-28, RF-60)', () => {
    it('no debe vincular a la clínica B con el dueño antes de escanear el tag, y debe vincularlo tras el escaneo', async () => {
      // 1. Crear un dueño y mascota en Clínica A con un nuevo tag
      const pet3Id = '88888888-3333-4333-8333-888888888888';
      const owner3Id = '88888888-4444-4333-8333-888888888888';
      const tag3Uid = '04FF11223344';

      db.owners.push({
        id: owner3Id,
        documentId: 'DOC-SCAN-TEST',
        name: 'Ana',
        lastName: 'García',
        phone: '+593911111111',
        email: 'ana.garcia@email.com',
        address: 'Calle 10',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.pets.push({
        id: pet3Id,
        name: 'Bobby',
        species: 'CANINE',
        breed: 'Poodle',
        ownerId: owner3Id,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.tags.push({
        id: 'tag-8888-4333-8333-888888888888',
        uid: tag3Uid,
        publicCode: 'pub-8888',
        status: TagStatus.ACTIVE,
        petId: pet3Id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      // 2. Clínica B consulta lookup: no crea ClinicOwner
      const lookup = await request(app.getHttpServer())
        .post('/owners/lookup')
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ documentId: 'DOC-SCAN-TEST' });
      assert.strictEqual(lookup.status, 200);

      // Verificar que Clínica B NO lo ve en GET /owners
      const getOwnersBefore = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        getOwnersBefore.body.data.some((o: any) => o.id === owner3Id),
        false,
        'El dueño no debe aparecer en GET /owners de Clínica B antes del escaneo',
      );

      // Verificar que GET /owners/:id retorna 404
      const getOwnerBefore = await request(app.getHttpServer())
        .get(`/owners/${owner3Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(getOwnerBefore.status, 404);

      // 3. Clínica B escanea el tag
      const scanRes = await request(app.getHttpServer())
        .get(`/tags/resolve/${tag3Uid}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(scanRes.status, 200);

      // 4. Ahora Clínica B SÍ tiene el vínculo y puede ver al dueño
      const getOwnersAfter = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        getOwnersAfter.body.data.some((o: any) => o.id === owner3Id),
        true,
        'El dueño debe aparecer en GET /owners de Clínica B tras escanear el tag',
      );

      const getOwnerAfter = await request(app.getHttpServer())
        .get(`/owners/${owner3Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(getOwnerAfter.status, 200);
      assert.strictEqual(getOwnerAfter.body.id, owner3Id);
    });
  });

  describe('Prueba Cuatro: GET /owners/:id de un dueño sin vínculo devuelve 404 (RF-60)', () => {
    it('debe denegar con HTTP 404 Not Found cuando una clínica intenta consultar un dueño sin vínculo asistencial', async () => {
      // OWNER_1_ID pertenece originalmente a Clínica A y Clínica B no lo tiene vinculado
      const res = await request(app.getHttpServer())
        .get(`/owners/${OWNER_1_ID}`)
        .set('Authorization', `Bearer ${adminBToken}`);

      assert.strictEqual(
        res.status,
        404,
        `Se esperaba HTTP 404 Not Found pero se obtuvo HTTP ${res.status}. Clínica B pudo consultar al dueño ajeno sin vínculo.`,
      );
    });
  });

  describe('Prueba Cinco: hasCareRelationship y proyección condicional de datos del dueño (RF-60)', () => {
    it('debe mostrar solo name, lastName y phone si solo hay escaneo o citas no cerradas; y proyección completa tras cerrar visita médica o vacunar', async () => {
      const owner4Id = '99999999-4444-4444-8444-999999999994';
      const pet4Id = '99999999-4444-4444-8444-999999999995';
      const tag4Uid = '04AABBCCDDEE';

      db.owners.push({
        id: owner4Id,
        documentId: 'DOC-CARE-444',
        name: 'Carlos',
        lastName: 'Mendoza',
        phone: '+593944444444',
        email: 'care444@vetapp.com',
        address: 'Av. Siempre Viva 444',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.pets.push({
        id: pet4Id,
        name: 'Max',
        species: 'CANINE',
        breed: 'Labrador',
        ownerId: owner4Id,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.tags.push({
        id: 'tag-9999-4444-8444-999999999996',
        uid: tag4Uid,
        publicCode: 'pub-9999-444',
        status: TagStatus.ACTIVE,
        petId: pet4Id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      // 1. Clínica B escanea el tag
      const scanRes = await request(app.getHttpServer())
        .get(`/tags/resolve/${tag4Uid}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(scanRes.status, 200);

      // 2. Consulta GET /owners/:id por Clínica B: DEBE SER PROYECCIÓN MÍNIMA
      const minOwnerRes = await request(app.getHttpServer())
        .get(`/owners/${owner4Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(minOwnerRes.status, 200);
      assert.strictEqual(minOwnerRes.body.name, 'Carlos');
      assert.strictEqual(minOwnerRes.body.lastName, 'Mendoza');
      assert.strictEqual(minOwnerRes.body.phone, '+593944444444');
      assert.strictEqual(minOwnerRes.body.documentId, undefined, 'documentId debe omitirse en proyección mínima');
      assert.strictEqual(minOwnerRes.body.email, undefined, 'email debe omitirse en proyección mínima');
      assert.strictEqual(minOwnerRes.body.address, undefined, 'address debe omitirse en proyección mínima');

      // 3. Clínica B agenda una visita (status: SCHEDULED, closedAt: null)
      const visitRes = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetBToken}`)
        .send({
          petId: pet4Id,
          vetId: USER_VET_B_ID,
          scheduledDate: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 30,
          reason: 'Control rutinario preventivo',
        });
      assert.strictEqual(visitRes.status, 201);
      const visitId = visitRes.body.id;

      // Las visitas no cerradas NO otorgan care relationship
      const stillMinOwnerRes = await request(app.getHttpServer())
        .get(`/owners/${owner4Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(stillMinOwnerRes.status, 200);
      assert.strictEqual(stillMinOwnerRes.body.documentId, undefined, 'Visita SCHEDULED no debe otorgar proyección completa');

      // 4. Veterinario de Clínica B atiende y CIERRA la visita formalmente
      await request(app.getHttpServer())
        .patch(`/visits/${visitId}/attend`)
        .set('Authorization', `Bearer ${vetBToken}`)
        .send({ diagnosis: 'Paciente sano', weight: 25.5 });

      const closeRes = await request(app.getHttpServer())
        .post(`/visits/${visitId}/close`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(closeRes.status, 201);

      // 5. Ahora Clínica B SÍ tiene care relationship y debe ver la PROYECCIÓN COMPLETA
      const fullOwnerRes = await request(app.getHttpServer())
        .get(`/owners/${owner4Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(fullOwnerRes.status, 200);
      assert.strictEqual(fullOwnerRes.body.name, 'Carlos');
      assert.strictEqual(fullOwnerRes.body.documentId, 'DOC-CARE-444', 'documentId debe ser visible con care relationship');
      assert.strictEqual(fullOwnerRes.body.email, 'care444@vetapp.com', 'email debe ser visible con care relationship');
      assert.strictEqual(fullOwnerRes.body.address, 'Av. Siempre Viva 444', 'address debe ser visible con care relationship');
    });
  });

  describe('Prueba Seis: Inferencia en GET /owners mediante búsqueda y filtros bloqueada para vínculo mínimo (RF-60)', () => {
    it('los filtros por documentId, email y address no deben operar sobre dueños con vínculo mínimo, evitando inferencia de datos privados', async () => {
      const owner5Id = '99999999-5555-5555-8555-999999999995';
      const pet5Id = '99999999-5555-5555-8555-999999999996';
      const tag5Uid = '045555555555';

      db.owners.push({
        id: owner5Id,
        documentId: 'DOC-SECRET-555',
        name: 'Lucia',
        lastName: 'Navarro',
        phone: '+593955555555',
        email: 'secret555@vetapp.com',
        address: 'Calle Secreta 555',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.pets.push({
        id: pet5Id,
        name: 'Luna',
        species: 'FELINE',
        breed: 'Siames',
        ownerId: owner5Id,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.tags.push({
        id: 'tag-9999-5555-8555-999999999997',
        uid: tag5Uid,
        publicCode: 'pub-9999-555',
        status: TagStatus.ACTIVE,
        petId: pet5Id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      // Clínica B escanea el tag para obtener vínculo mínimo (sin care relationship)
      await request(app.getHttpServer())
        .get(`/tags/resolve/${tag5Uid}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      // Búsqueda por documentId: NO DEBE RETORNARLO A CLÍNICA B
      const searchDocRes = await request(app.getHttpServer())
        .get('/owners?documentId=DOC-SECRET-555')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        searchDocRes.body.data.some((o: any) => o.id === owner5Id),
        false,
        'Clínica B con vínculo mínimo no debe poder inferir si existe el documentId buscando por él',
      );

      // Búsqueda por email: NO DEBE RETORNARLO A CLÍNICA B
      const searchEmailRes = await request(app.getHttpServer())
        .get('/owners?email=secret555@vetapp.com')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        searchEmailRes.body.data.some((o: any) => o.id === owner5Id),
        false,
        'Clínica B con vínculo mínimo no debe poder inferir si existe el email buscando por él',
      );

      // Búsqueda por address: NO DEBE RETORNARLO A CLÍNICA B
      const searchAddressRes = await request(app.getHttpServer())
        .get('/owners?address=Secreta')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        searchAddressRes.body.data.some((o: any) => o.id === owner5Id),
        false,
        'Clínica B con vínculo mínimo no debe poder inferir si existe el address buscando por él',
      );

      // Búsqueda por query general con documentId: NO DEBE RETORNARLO A CLÍNICA B
      const searchQueryDocRes = await request(app.getHttpServer())
        .get('/owners?query=DOC-SECRET-555')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        searchQueryDocRes.body.data.some((o: any) => o.id === owner5Id),
        false,
        'Búsqueda global por documentId no debe retornar dueños con vínculo mínimo',
      );

      // Búsqueda por name (Lucia): SÍ lo retorna a Clínica B, pero con proyección mínima
      const searchNameRes = await request(app.getHttpServer())
        .get('/owners?lastName=Navarro')
        .set('Authorization', `Bearer ${vetBToken}`);
      const foundInName = searchNameRes.body.data.find((o: any) => o.id === owner5Id);
      assert.ok(foundInName, 'Búsqueda por nombre o apellido debe permitir encontrar al dueño vinculado');
      assert.strictEqual(foundInName.documentId, undefined, 'documentId debe estar censurado');
      assert.strictEqual(foundInName.email, undefined, 'email debe estar censurado');
      assert.strictEqual(foundInName.address, undefined, 'address debe estar censurado');

      // En cambio, Clínica A (creadora con proyección completa) SÍ lo encuentra por documentId
      const searchDocClinicaARes = await request(app.getHttpServer())
        .get('/owners?documentId=DOC-SECRET-555')
        .set('Authorization', `Bearer ${adminAToken}`);
      const foundInA = searchDocClinicaARes.body.data.find((o: any) => o.id === owner5Id);
      assert.ok(foundInA, 'Clínica A con care relationship sí puede buscar y ver por documentId');
      assert.strictEqual(foundInA.documentId, 'DOC-SECRET-555');
    });
  });

  describe('Prueba Siete: Vencimiento de ClinicOwner (RF-60)', () => {
    it('un vínculo con expiresAt en el pasado debe considerarse vencido y denegar acceso con 404', async () => {
      const owner6Id = '99999999-6666-6666-8666-999999999996';
      db.owners.push({
        id: owner6Id,
        documentId: 'DOC-EXPIRED-666',
        name: 'Roberto',
        lastName: 'Pérez',
        phone: '+593966666666',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.clinicOwners.push({
        id: 'co-expired-666',
        clinicId: CLINIC_B_ID,
        ownerId: owner6Id,
        consentedAt: new Date(Date.now() - 31 * 86400000),
        expiresAt: new Date(Date.now() - 10000), // Expirado hace 10 segundos
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      // GET /owners/:id debe responder 404
      const res = await request(app.getHttpServer())
        .get(`/owners/${owner6Id}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(res.status, 404, 'Vínculo expirado debe devolver 404 Not Found');

      // GET /owners no debe incluir al dueño expirado
      const listRes = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        listRes.body.data.some((o: any) => o.id === owner6Id),
        false,
        'Dueño con vínculo expirado no debe aparecer en GET /owners',
      );
    });
  });

  describe('Prueba Ocho: ClinicOwner con status REVOKED bloquea escaneo (403 sin grant y con traza) y vínculo vencido se renueva (RF-28, RF-60)', () => {
    it('un ClinicOwner REVOKED bloquea el escaneo con 403 y registra en AccessLog sin emitir AccessGrant; un vínculo vencido se renueva', async () => {
      const owner7Id = '99999999-7777-7777-8777-999999999997';
      const pet7Id = '99999999-7777-7777-8777-999999999998';
      const tag7Uid = '047777777777';

      db.owners.push({
        id: owner7Id,
        documentId: 'DOC-REVOKED-777',
        name: 'Elena',
        lastName: 'Rios',
        phone: '+593977777777',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.pets.push({
        id: pet7Id,
        name: 'Toby',
        species: 'CANINE',
        breed: 'Beagle',
        ownerId: owner7Id,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.tags.push({
        id: 'tag-9999-7777-8777-999999999999',
        uid: tag7Uid,
        publicCode: 'pub-9999-777',
        status: TagStatus.ACTIVE,
        petId: pet7Id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Vínculo previo revocado
      db.clinicOwners.push({
        id: 'co-revoked-777',
        clinicId: CLINIC_B_ID,
        ownerId: owner7Id,
        consentedAt: new Date(Date.now() - 50000),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(Date.now() - 10000),
        status: 'REVOKED',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      // Escaneo de tag de un dueño REVOKED: DEBE BLOQUEAR CON 403
      const scanRes = await request(app.getHttpServer())
        .get(`/tags/resolve/${tag7Uid}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(
        scanRes.status,
        403,
        `Se esperaba 403 Forbidden por vínculo REVOKED pero se obtuvo ${scanRes.status}`,
      );

      // Traza en AccessLog debe registrarse
      if (testContext.isRealDb) {
        const latestLog = await testContext.prisma.accessLog.findFirst({
          where: { petId: pet7Id, clinicId: CLINIC_B_ID, action: AccessAction.NFC_SCAN },
          orderBy: { timestamp: 'desc' },
        });
        assert.ok(latestLog, 'Debe existir la traza en AccessLog en PostgreSQL');
        assert.strictEqual(latestLog.action, AccessAction.NFC_SCAN);

        // NO debe existir AccessGrant activo para Clínica B y pet7
        const grant = await testContext.prisma.accessGrant.findFirst({
          where: { petId: pet7Id, clinicId: CLINIC_B_ID },
        });
        assert.strictEqual(grant, null, 'No debe emitirse AccessGrant ante status REVOKED');
      } else {
        const latestLog = db.accessLogs.find(
          (l: any) => l.petId === pet7Id && l.clinicId === CLINIC_B_ID && l.action === AccessAction.NFC_SCAN,
        );
        assert.ok(latestLog, 'Debe existir la traza en AccessLog');
        const grant = db.accessGrants.find(
          (g: any) => g.petId === pet7Id && g.clinicId === CLINIC_B_ID,
        );
        assert.strictEqual(grant, undefined, 'No debe emitirse AccessGrant ante status REVOKED');
      }

      // Caso Vínculo Vencido: se renueva por 30 días
      const owner8Id = '99999999-8888-8888-8888-999999999998';
      const pet8Id = '99999999-8888-8888-8888-999999999999';
      const tag8Uid = '048888888888';

      db.owners.push({
        id: owner8Id,
        documentId: 'DOC-EXPIRED-888',
        name: 'Roberto',
        lastName: 'Diaz',
        phone: '+593988888888',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.pets.push({
        id: pet8Id,
        name: 'Max',
        species: 'CANINE',
        breed: 'Pastor',
        ownerId: owner8Id,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.tags.push({
        id: 'tag-9999-8888-8888-999999999999',
        uid: tag8Uid,
        publicCode: 'pub-9999-888',
        status: TagStatus.ACTIVE,
        petId: pet8Id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      db.clinicOwners.push({
        id: 'co-expired-888',
        clinicId: CLINIC_B_ID,
        ownerId: owner8Id,
        consentedAt: new Date(Date.now() - 40 * 86400000),
        expiresAt: new Date(Date.now() - 10000), // Expirado hace 10s
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (testContext.syncToPostgres) {
        await testContext.syncToPostgres();
      }

      const scanExpiredRes = await request(app.getHttpServer())
        .get(`/tags/resolve/${tag8Uid}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(scanExpiredRes.status, 200, 'Escaneo con vínculo vencido debe renovar y responder 200');

      if (testContext.isRealDb) {
        const renewed = await (testContext.prisma as any).clinicOwner.findFirst({
          where: { clinicId: CLINIC_B_ID, ownerId: owner8Id },
        });
        assert.ok(renewed);
        assert.strictEqual(renewed.status, 'ACTIVE');
        assert.ok(new Date(renewed.expiresAt) > new Date(Date.now() + 25 * 86400000));
      } else {
        const renewed = db.clinicOwners.find(
          (co: any) => co.clinicId === CLINIC_B_ID && co.ownerId === owner8Id,
        );
        assert.ok(renewed);
        assert.strictEqual(renewed.status, 'ACTIVE');
        assert.ok(renewed.expiresAt > new Date(Date.now() + 25 * 86400000));
      }
    });
  });
});
