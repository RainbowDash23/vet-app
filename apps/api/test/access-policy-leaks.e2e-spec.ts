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
  const visitClinicAId = '33333333-aaaa-4333-8333-333333333333';
  const tagClinicAId = 'tag-1111-4111-8111-111111111111';
  const attachmentClinicAId = 'attachment-clinic-a-confidential-001';

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;

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
});
