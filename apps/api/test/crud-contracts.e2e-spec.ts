import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PetSex, PetSpecies, ReproductiveStatus, TagStatus, VisitStatus } from '@prisma/client';
import {
  createTestApp,
  SEED_PASSWORDS,
  CLINIC_A_ID,
  USER_ADMIN_ID,
  USER_VET_A_ID,
  OWNER_1_ID,
  PET_1_ID,
  TAG_1_UID,
  InMemoryDb,
  request,
} from './e2e-helper';

describe('E2E: Contratos CRUD y Completitud Desktop-API (PostgreSQL / E2E)', () => {
  let app: INestApplication;
  let db: InMemoryDb;
  let adminToken: string;
  let vetToken: string;
  let testContext: any;

  before(async () => {
    testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;

    // Login Administrador Clínica A
    const loginAdmin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@vetapp.com', password: SEED_PASSWORDS.admin })
      .expect(200);
    adminToken = loginAdmin.body.accessToken;

    // Login Veterinario Clínica A
    const loginVet = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'vet@vetapp.com', password: SEED_PASSWORDS.vet })
      .expect(200);
    vetToken = loginVet.body.accessToken;

    // Escanear/resolver tag NFC para generar AccessGrant activo de 24h
    await request(app.getHttpServer())
      .get(`/tags/resolve/${TAG_1_UID}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Datos de la Clínica (PATCH /clinics/current)', () => {
    it('debe rechazar un teléfono sin formato internacional E.164 con 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch('/clinics/current')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Clínica Veterinaria Central',
          phone: '0987654321', // Sin prefijo +
          address: 'Av. Siempre Viva 742',
        })
        .expect(400);

      assert.ok(
        JSON.stringify(res.body.message).toLowerCase().includes('e.164') ||
          JSON.stringify(res.body.message).toLowerCase().includes('internacional'),
      );
    });

    it('debe actualizar los datos institucionales exitosamente con teléfono E.164 válido', async () => {
      const res = await request(app.getHttpServer())
        .patch('/clinics/current')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Clínica Veterinaria San Francisco',
          phone: '+593987654321',
          address: 'Av. 10 de Agosto #45-12',
        })
        .expect(200);

      assert.strictEqual(res.body.name, 'Clínica Veterinaria San Francisco');
      assert.strictEqual(res.body.phone, '+593987654321');
      assert.strictEqual(res.body.address, 'Av. 10 de Agosto #45-12');
    });

    it('GET /clinics/current debe retornar los datos actualizados para alimentar el portal de auxilio', async () => {
      const res = await request(app.getHttpServer())
        .get('/clinics/current')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.name, 'Clínica Veterinaria San Francisco');
      assert.strictEqual(res.body.phone, '+593987654321');
    });
  });

  describe('2. Edición de Propietario (PATCH /owners/:id)', () => {
    it('debe rechazar teléfono inválido con 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch(`/owners/${OWNER_1_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Juan',
          lastName: 'Pérez',
          phone: 'invalid-phone',
        })
        .expect(400);
    });

    it('debe actualizar datos de contacto del dueño con payload del desktop', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/owners/${OWNER_1_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Juan Carlos',
          lastName: 'Pérez Gómez',
          phone: '+593911223344',
          email: 'juancarlos@ejemplo.com',
          address: 'Calle Nueva 456',
        })
        .expect(200);

      assert.strictEqual(res.body.name, 'Juan Carlos');
      assert.strictEqual(res.body.lastName, 'Pérez Gómez');
      assert.strictEqual(res.body.phone, '+593911223344');
      assert.strictEqual(res.body.email, 'juancarlos@ejemplo.com');
    });
  });

  describe('3. Edición y Baja Lógica de Mascota (PATCH & DELETE /pets/:id)', () => {
    it('debe actualizar los atributos clínicos y de filiación con payload de EditPetModal', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pets/${PET_1_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Maximus Actualizado',
          species: PetSpecies.CANINE,
          breed: 'Golden Retriever',
          sex: PetSex.MALE,
          birthDate: '2021-08-15T00:00:00.000Z',
          isApproximateBirthDate: true,
          color: 'Dorado Claro',
          reproductiveStatus: ReproductiveStatus.NEUTERED,
          notes: 'Paciente dócil, sensible al polen',
        })
        .expect(200);

      assert.strictEqual(res.body.name, 'Maximus Actualizado');
      assert.strictEqual(res.body.color, 'Dorado Claro');
      assert.strictEqual(res.body.reproductiveStatus, ReproductiveStatus.NEUTERED);
    });

    it('debe rechazar la eliminación lógica (DELETE) con HTTP 409 si la mascota tiene visitas', async () => {
      // Registrar una visita para PET_1_ID
      const scheduledDate = new Date(Date.now() + 86400000 * 2).toISOString();
      await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          reason: 'Consulta general y chequeo preventivo',
          startTime: scheduledDate,
          scheduledDate,
          durationMinutes: 30,
        })
        .expect(201);

      // Intentar eliminar la mascota
      const res = await request(app.getHttpServer())
        .delete(`/pets/${PET_1_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      assert.ok(
        res.body.message.includes('No se puede eliminar una mascota con visitas clínicas registradas'),
        `Mensaje recibido: ${res.body.message}`,
      );
    });

    it('debe permitir la baja lógica si la mascota no tiene visitas clínicas asociadas', async () => {
      // Crear una mascota sin visitas
      const newPetRes = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Mascota Sin Visitas',
          species: PetSpecies.FELINE,
          breed: 'Siamés',
          sex: PetSex.FEMALE,
          birthDate: '2023-01-01T00:00:00.000Z',
          isApproximateBirthDate: false,
          ownerId: OWNER_1_ID,
        })
        .expect(201);

      const createdPetId = newPetRes.body.id;

      // Baja lógica exitosa
      const deleteRes = await request(app.getHttpServer())
        .delete(`/pets/${createdPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.ok(deleteRes.body.deletedAt !== null);
    });
  });

  describe('4. Gestión de Llaveros NFC (PATCH /tags/:id/status con reason)', () => {
    let activeTagId: string;

    before(async () => {
      const tagsRes = await request(app.getHttpServer())
        .get(`/tags/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const tag = tagsRes.body.find((t: any) => t.status === TagStatus.ACTIVE) || tagsRes.body[0];
      activeTagId = tag.id;
    });

    it('debe aceptar payload de reporte de extravío con propiedad "reason" sin lanzar 400', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tags/${activeTagId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: TagStatus.LOST,
          reason: 'Reporte de extravío por el propietario',
        })
        .expect(200);

      assert.strictEqual(res.body.status, TagStatus.LOST);
    });

    it('debe aceptar reporte de deterioro (DAMAGED) con "reason"', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tags/${activeTagId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: TagStatus.DAMAGED,
          reason: 'Transpondedor roto en accidente',
        })
        .expect(200);

      assert.strictEqual(res.body.status, TagStatus.DAMAGED);
    });

    it('debe permitir asignar un nuevo llavero (reasignación) tras marcar el anterior', async () => {
      const newUid = '04' + crypto.randomBytes(5).toString('hex').toUpperCase();
      const res = await request(app.getHttpServer())
        .post('/tags/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          uid: newUid,
          petId: PET_1_ID,
        })
        .expect(201);

      assert.strictEqual(res.body.uid, newUid);
      assert.strictEqual(res.body.status, TagStatus.ACTIVE);
    });
  });

  describe('5. Vacunas con Próximo Refuerzo (POST & GET /vaccinations)', () => {
    it('debe registrar una vacuna con nextDueDate y recuperarla en el carnet', async () => {
      const appliedAt = new Date().toISOString();
      const nextDueDate = new Date(Date.now() + 86400000 * 365).toISOString();

      const createRes = await request(app.getHttpServer())
        .post('/vaccinations')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vaccineName: 'Séxtuple Canina Vanguard',
          batchNumber: 'LOTE-2026-V1',
          appliedAt,
          nextDueDate,
          notes: 'Dosis anual de refuerzo. Sin reacciones anafilácticas.',
        })
        .expect(201);

      assert.strictEqual(createRes.body.vaccineName, 'Séxtuple Canina Vanguard');
      assert.strictEqual(createRes.body.batchNumber, 'LOTE-2026-V1');
      assert.ok(createRes.body.nextDueDate !== null);

      // Consultar carnet de la mascota
      const listRes = await request(app.getHttpServer())
        .get(`/vaccinations/pet/${PET_1_ID}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .expect(200);

      const found = listRes.body.data.find((v: any) => v.id === createRes.body.id);
      assert.ok(found, 'La vacuna creada debe estar en el listado del carnet');
      assert.strictEqual(found.batchNumber, 'LOTE-2026-V1');
    });
  });

  describe('6. Ciclo de Visitas Clínicas (Crear, Atender, Cerrar, Cancelar)', () => {
    let visitId: string;

    it('GET /visits debe aceptar parámetros date y clinicId enviados por desktop sin 400', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app.getHttpServer())
        .get(`/visits?date=${today}&clinicId=${CLINIC_A_ID}&limit=50`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.ok(Array.isArray(res.body.data));
    });

    it('debe agendar una nueva cita (crear)', async () => {
      const startTime = new Date(Date.now() + 86400000 * 3).toISOString();
      const res = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          reason: 'Control cardiológico semestral',
          startTime,
          scheduledDate: startTime,
          durationMinutes: 45,
        })
        .expect(201);

      visitId = res.body.id;
      assert.strictEqual(res.body.status, VisitStatus.SCHEDULED);
    });

    it('debe registrar la atención médica con constantes vitales (atender)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/visits/${visitId}/attend`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          diagnosis: 'Soplo sistólico grado II/VI compensado',
          treatment: 'Enalapril 5mg cada 12h y dieta baja en sodio',
          weight: 28.5,
          temperature: 38.4,
          heartRate: 110,
          respiratoryRate: 24,
          capillaryRefillTime: 2,
          notes: 'Paciente alerta y responsivo a estímulos',
        })
        .expect(200);

      assert.strictEqual(res.body.weight, 28.5);
      assert.strictEqual(res.body.diagnosis, 'Soplo sistólico grado II/VI compensado');
    });

    it('debe cerrar formalmente la consulta médica (cerrar)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/visits/${visitId}/close`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({})
        .expect(201);

      assert.ok(res.body.closedAt !== null);
    });

    it('debe rechazar la cancelación con motivo < 10 caracteres con 400 Bad Request', async () => {
      const cancelStartTime = new Date(Date.now() + 86400000 * 4).toISOString();
      const newVisit = await request(app.getHttpServer())
        .post('/visits')
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          petId: PET_1_ID,
          vetId: USER_VET_A_ID,
          reason: 'Visita para prueba de cancelación',
          startTime: cancelStartTime,
          scheduledDate: cancelStartTime,
          durationMinutes: 20,
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/visits/${newVisit.body.id}/cancel`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({ cancellationReason: 'Corto' })
        .expect(400);

      // Con motivo >= 10 caracteres debe cancelar exitosamente
      const cancelRes = await request(app.getHttpServer())
        .patch(`/visits/${newVisit.body.id}/cancel`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({ cancellationReason: 'Propietario no puede asistir por emergencia familiar' })
        .expect(200);

      assert.strictEqual(cancelRes.body.status, VisitStatus.CANCELLED);
      assert.strictEqual(
        cancelRes.body.cancellationReason,
        'Propietario no puede asistir por emergencia familiar',
      );
    });
  });
});
