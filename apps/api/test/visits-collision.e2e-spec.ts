import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  SEED_PASSWORDS,
  USER_VET_A_ID,
  PET_1_ID,
  request,
} from './e2e-helper';

describe('E2E: Validación de Solapamiento de Agenda Médica y Cancelación (visits-collision.e2e-spec.ts)', () => {
  let app: INestApplication;
  let vetToken: string;
  let baselineVisitId: string;

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;

    // Obtener token JWT de veterinario para autorizar las solicitudes
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'vet@vetapp.com',
        password: SEED_PASSWORDS.vet,
      });

    assert.strictEqual(loginRes.status, 200);
    vetToken = loginRes.body.accessToken;

    // Crear turno base de referencia: 2026-11-01 de 10:00:00 a 10:30:00 (duración 30 min)
    const baselineRes = await request(app.getHttpServer())
      .post('/visits')
      .set('Authorization', `Bearer ${vetToken}`)
      .send({
        petId: PET_1_ID,
        vetId: USER_VET_A_ID,
        scheduledDate: '2026-11-01T10:00:00.000Z',
        durationMinutes: 30,
        reason: 'Consulta médica base de control',
      });

    assert.strictEqual(baselineRes.status, 201);
    baselineVisitId = baselineRes.body.id;
    assert.ok(baselineVisitId);
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Casos de Frontera de Solapamiento de Horarios (RF-40)', () => {
    it('1. Turno que finaliza exactamente cuando inicia otro (09:30 - 10:00): Permitido sin colisión', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T09:30:00.000Z',
          durationMinutes: 30,
          reason: 'Consulta contigua previa',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
    });

    it('2. Turno que inicia exactamente cuando finaliza otro (10:30 - 11:00): Permitido sin colisión', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T10:30:00.000Z',
          durationMinutes: 30,
          reason: 'Consulta contigua posterior',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
    });

    it('3. Turno completamente contenido en otro (10:05 - 10:25): Rechazado con HTTP 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T10:05:00.000Z',
          durationMinutes: 20,
          reason: 'Consulta superpuesta interna',
        });

      assert.strictEqual(res.status, 409);
      assert.ok(
        res.body.message.includes('solapamiento') ||
          res.body.message.includes('consulta agendada') ||
          res.body.statusCode === 409,
      );
    });

    it('4. Turno que engloba completamente a otro (09:50 - 10:40): Rechazado con HTTP 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T09:50:00.000Z',
          durationMinutes: 50,
          reason: 'Consulta englobante externa',
        });

      assert.strictEqual(res.status, 409);
    });

    it('5. Turno que solapa inicio con fin previo (09:45 - 10:15): Rechazado con HTTP 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T09:45:00.000Z',
          durationMinutes: 30,
          reason: 'Consulta solapada al inicio',
        });

      assert.strictEqual(res.status, 409);
    });

    it('6. Turno que solapa fin con inicio posterior (10:15 - 10:45): Rechazado con HTTP 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T10:15:00.000Z',
          durationMinutes: 30,
          reason: 'Consulta solapada al final',
        });

      assert.strictEqual(res.status, 409);
    });
  });

  describe('7. Cancelación Justificada y Liberación de Agenda (RF-41, RF-42)', () => {
    it('debe cancelar visita con motivo obligatorio y liberar el intervalo de agenda del veterinario', async () => {
      // 1. Cancelar la cita base (10:00 - 10:30)
      const cancelRes = await request(app.getHttpServer())
        .patch(`/visits/${baselineVisitId}/cancel`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          cancellationReason: 'Propietario reprogramó cita por motivos laborales justificados',
        });

      assert.strictEqual(cancelRes.status, 200);
      assert.strictEqual(cancelRes.body.status, 'CANCELLED');
      assert.strictEqual(
        cancelRes.body.cancellationReason,
        'Propietario reprogramó cita por motivos laborales justificados',
      );

      // 2. Comprobar que ahora el intervalo exacto (10:00 - 10:30) se encuentra libre
      const reScheduleRes = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          scheduledDate: '2026-11-01T10:00:00.000Z',
          durationMinutes: 30,
          reason: 'Nuevo turno agendado en horario liberado',
        });

      assert.strictEqual(reScheduleRes.status, 201);
      assert.strictEqual(reScheduleRes.body.status, 'SCHEDULED');
      assert.notStrictEqual(reScheduleRes.body.id, baselineVisitId);
    });
  });
});
