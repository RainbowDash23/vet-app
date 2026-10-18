import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { GrantScope, GrantSource, VisitStatus } from '@prisma/client';
import {
  createTestApp,
  SEED_PASSWORDS,
  CLINIC_A_ID,
  CLINIC_B_ID,
  USER_VET_A_ID,
  USER_VET_B_ID,
  PET_1_ID,
  InMemoryDb,
  request,
} from './e2e-helper';

describe('E2E: Aislamiento Multi-Tenant y Consentimientos Temporales (access-grants.e2e-spec.ts)', () => {
  let app: INestApplication;
  let db: InMemoryDb;
  let vetAToken: string;
  let vetBToken: string;

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;

    // Login veterinario de Clínica A
    const loginARes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'vet@vetapp.com',
        password: SEED_PASSWORDS.vet,
      });
    assert.strictEqual(loginARes.status, 200);
    vetAToken = loginARes.body.accessToken;

    // Login veterinario de Clínica B
    const loginBRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'vet2@vetapp.com',
        password: SEED_PASSWORDS.vetB,
      });
    assert.strictEqual(loginBRes.status, 200);
    vetBToken = loginBRes.body.accessToken;

    // Registrar una visita histórica en Clínica A para la mascota PET_1_ID
    db.visits.push({
      id: crypto.randomUUID(),
      clinicId: CLINIC_A_ID,
      vetId: USER_VET_A_ID,
      petId: PET_1_ID,
      scheduledDate: new Date('2026-10-01T09:00:00.000Z'),
      durationMinutes: 30,
      reason: 'Vacunación y chequeo general en Clínica Central',
      status: VisitStatus.SCHEDULED,
      anamnesis: 'Paciente en buen estado nutricional.',
      diagnosis: 'Constantes fisiológicas dentro de rango.',
      treatment: 'Administración de vacuna quíntuple.',
      deletedAt: null,
      closedAt: new Date('2026-10-01T09:30:00.000Z'),
      createdAt: new Date('2026-10-01T09:00:00.000Z'),
      updatedAt: new Date('2026-10-01T09:30:00.000Z'),
    });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Consulta de Historia Médica sin Consentimiento Activo (RF-24, RNF-8)', () => {
    it('debe bloquear con HTTP 403 Forbidden a la Clínica B al consultar historia de mascota sin AccessGrant activo', async () => {
      // Clínica B intenta consultar la historia de PET_1_ID sin grant
      const res = await request(app.getHttpServer())
        .get(`/visits/history/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 403);
      assert.ok(
        res.body.message.includes('consentimiento') ||
          res.body.message.includes('AccessGrant') ||
          res.body.statusCode === 403,
      );
    });
  });

  describe('2. Aprobación con AccessGrant Activo Vigente (RF-23)', () => {
    it('debe permitir a Clínica B acceder a la historia clínica cuando existe un AccessGrant de 24h activo', async () => {
      // Conceder AccessGrant de 24h a favor de Clínica B
      const grantId = crypto.randomUUID();
      db.accessGrants.push({
        id: grantId,
        petId: PET_1_ID,
        clinicId: CLINIC_B_ID,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // Vigente por 24 horas
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Clínica B vuelve a consultar la historia
      const res = await request(app.getHttpServer())
        .get(`/visits/history/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data), 'Debe devolver un arreglo data');
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].petId, PET_1_ID);
      assert.strictEqual(
        res.body.data[0].diagnosis,
        'Constantes fisiológicas dentro de rango.',
      );
      assert.ok(res.body.meta, 'Debe incluir metadata de paginación');
    });
  });

  describe('3. Detección de Expiración del AccessGrant (RF-24)', () => {
    it('cuando el grant de 24h expira, el acceso debe volver a bloquearse de inmediato con HTTP 403', async () => {
      // Expirar intencionalmente el grant de Clínica B
      const activeGrant = db.accessGrants.find(
        (g) => g.petId === PET_1_ID && g.clinicId === CLINIC_B_ID,
      );
      assert.ok(activeGrant, 'Debe existir el grant para expirarlo');
      activeGrant.expiresAt = new Date(Date.now() - 5000); // 5 segundos en el pasado

      // Clínica B consulta nuevamente
      const res = await request(app.getHttpServer())
        .get(`/visits/history/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);

      assert.strictEqual(res.status, 403);
      assert.ok(
        res.body.message.includes('consentimiento') ||
          res.body.message.includes('AccessGrant') ||
          res.body.statusCode === 403,
      );
    });
  });

  describe('4. Aislamiento Multi-Tenant Estricto (RNF-8)', () => {
    it('clínica B no puede acceder a historia clínica de paciente de clínica A sin mediar consentimiento específico', async () => {
      // Conceder grant a favor de Clínica A únicamente
      db.accessGrants.push({
        id: crypto.randomUUID(),
        petId: PET_1_ID,
        clinicId: CLINIC_A_ID,
        source: GrantSource.OWNER_SIGNATURE,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Clínica A tiene acceso con éxito
      const resA = await request(app.getHttpServer())
        .get(`/visits/history/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetAToken}`);
      assert.strictEqual(resA.status, 200);

      // Clínica B sigue sin grant vigente a su favor -> 403 Forbidden estricto
      const resB = await request(app.getHttpServer())
        .get(`/visits/history/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetBToken}`);
      assert.strictEqual(resB.status, 403);
    });
  });
});
