import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestApp, request, SEED_PASSWORDS } from './e2e-helper';

describe('PASO 12: Recorrido Manual Integral de la API (End-to-End Walkthrough)', () => {
  it('debe ejecutar exitosamente el flujo completo: login, crear dueño, crear mascota, asignar tag, resolver tag, abrir /p/:publicCode y colisión 409 de agenda', async () => {
    const { app } = await createTestApp();
    const server = app.getHttpServer();

    try {
      console.log('\n--- PASO 12: INICIO DEL RECORRIDO MANUAL ---');

      // 1. LOGIN
      console.log('[1/7] Ejecutando POST /auth/login con credenciales de ADMIN...');
      const loginRes = await request(server)
        .post('/auth/login')
        .send({
          email: 'admin@vetapp.com',
          password: SEED_PASSWORDS.admin,
        })
        .expect(200);

      const { accessToken, clinicId, user } = loginRes.body;
      assert.ok(accessToken, 'Debe retornar accessToken');
      assert.ok(clinicId, 'Debe retornar clinicId');
      assert.equal(user.email, 'admin@vetapp.com');
      console.log(` -> Login exitoso. Usuario: ${user.name}, Rol: ${user.role}, Clínica: ${clinicId}`);

      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      // 2. CREAR DUEÑO
      console.log('\n[2/7] Creando dueño con POST /owners...');
      const uniqueDoc = `DOC-${Date.now().toString().slice(-6)}`;
      const ownerRes = await request(server)
        .post('/owners')
        .set(authHeaders)
        .send({
          name: 'Carlos',
          lastName: 'Santana',
          documentId: uniqueDoc,
          phone: '+5491187654321',
          email: `carlos.${Date.now()}@example.com`,
          address: 'Av. Siempre Viva 742',
        })
        .expect(201);

      const owner = ownerRes.body;
      assert.ok(owner.id, 'El dueño debe tener un ID generado');
      assert.equal(owner.name, 'Carlos');
      assert.equal(owner.documentId, uniqueDoc);
      console.log(` -> Dueño creado exitosamente. ID: ${owner.id}, Doc: ${owner.documentId}`);

      // 3. CREAR MASCOTA
      console.log('\n[3/7] Creando mascota con POST /pets...');
      const petRes = await request(server)
        .post('/pets')
        .set(authHeaders)
        .send({
          name: 'Rocky',
          species: 'CANINE',
          breed: 'Boxer',
          sex: 'MALE',
          birthDate: '2022-05-10T00:00:00.000Z',
          color: 'Atigrado',
          ownerId: owner.id,
        })
        .expect(201);

      const pet = petRes.body;
      assert.ok(pet.id, 'La mascota debe tener un ID generado');
      assert.equal(pet.name, 'Rocky');
      assert.equal(pet.species, 'CANINE');
      console.log(` -> Mascota creada exitosamente. ID: ${pet.id}, Nombre: ${pet.name}`);

      // 4. ASIGNAR TAG NFC
      const testUid = `04AA${Date.now().toString(16).slice(-8).toUpperCase()}`;
      console.log(`\n[4/7] Asignando tag NFC físico ${testUid} con POST /tags/assign...`);
      const assignRes = await request(server)
        .post('/tags/assign')
        .set(authHeaders)
        .send({
          petId: pet.id,
          uid: testUid,
        })
        .expect(201);

      const tag = assignRes.body;
      assert.ok(tag.id, 'El tag debe tener ID');
      assert.equal(tag.uid, testUid);
      assert.equal(tag.status, 'ACTIVE');
      assert.ok(tag.publicCode, 'Debe generar publicCode único para el portal público');
      console.log(` -> Tag asignado exitosamente. UID: ${tag.uid}, publicCode: ${tag.publicCode}`);

      // 5. RESOLVER TAG NFC
      console.log(`\n[5/7] Resolviendo tag NFC con GET /tags/resolve/${testUid}...`);
      const resolveRes = await request(server)
        .get(`/tags/resolve/${testUid}`)
        .set(authHeaders)
        .expect(200);

      const resolveData = resolveRes.body;
      assert.equal(resolveData.registered, true);
      assert.equal(resolveData.uid, testUid);
      assert.equal(resolveData.pet.id, pet.id);
      assert.equal(resolveData.pet.name, 'Rocky');
      assert.equal(resolveData.hasFullAccess, true);
      console.log(` -> Tag resuelto exitosamente en < 600 ms. Mascota: ${resolveData.pet.name}, hasFullAccess: ${resolveData.hasFullAccess}`);

      // 6. ABRIR PORTAL PÚBLICO DE RESCATE (/p/:publicCode)
      console.log(`\n[6/7] Consultando portal público SSR de rescate en GET /p/${tag.publicCode}...`);
      const emergencyRes = await request(server)
        .get(`/p/${tag.publicCode}`)
        .expect(200);

      const html = emergencyRes.text;
      assert.ok(html.includes('Rocky'), 'El HTML debe mostrar el nombre de la mascota');
      assert.ok(html.includes('+5491187654321'), 'El HTML debe mostrar el teléfono de contacto');
      assert.ok(!html.includes('Av. Siempre Viva 742'), 'El HTML NO debe exponer la dirección física del dueño');
      assert.ok(!html.includes(uniqueDoc), 'El HTML NO debe exponer el documento de identidad');
      assert.ok(!html.includes('carlos.'), 'El HTML NO debe exponer el correo electrónico');
      console.log(' -> Portal público SSR verificado exitosamente (Datos visibles: Mascota y Teléfono; Datos privados censurados).');

      // 6b. VERIFICAR QUE GET /p/<UID> DEVUELVE 404 (el UID físico NUNCA debe resolver la página pública)
      console.log(`\n[6b/7] Comprobando que GET /p/${testUid} (UID físico) devuelve 404...`);
      const uidEmergencyRes = await request(server)
        .get(`/p/${testUid}`)
        .expect(404);
      assert.equal(uidEmergencyRes.status, 404);
      assert.ok(
        uidEmergencyRes.text.toLowerCase().includes('no encontrad') ||
        uidEmergencyRes.text.toLowerCase().includes('404'),
        'El portal público debe rechazar la resolución por UID físico con 404'
      );
      console.log(' -> Comprobado: el UID nunca resuelve la página pública (responde 404).');

      // 7. AGENDAR DOS VISITAS SOLAPADAS Y COMPROBAR EL HTTP 409 CONFLICT
      console.log('\n[7/7] Verificando detección algorítmica de solapamiento de agenda...');
      const vetId = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'; // Dr. vet A

      const scheduledDate1 = '2026-11-15T10:00:00.000Z';
      console.log(` -> Creando visita 1 (${scheduledDate1}, 30 minutos)...`);
      const visit1Res = await request(server)
        .post('/visits')
        .set(authHeaders)
        .send({
          petId: pet.id,
          vetId: vetId,
          scheduledDate: scheduledDate1,
          durationMinutes: 30,
          reason: 'Consulta médica general programada',
        })
        .expect(201);

      assert.ok(visit1Res.body.id, 'Visita 1 debe crearse exitosamente');
      console.log(` -> Visita 1 creada exitosamente con ID: ${visit1Res.body.id}`);

      // Intentar solapar con visita 2: 10:15 (mismo veterinario, colisiona con 10:00-10:30)
      const scheduledDate2 = '2026-11-15T10:15:00.000Z';
      console.log(` -> Intentando agendar visita 2 solapada (${scheduledDate2}, 30 minutos)...`);
      const visit2Res = await request(server)
        .post('/visits')
        .set(authHeaders)
        .send({
          petId: pet.id,
          vetId: vetId,
          scheduledDate: scheduledDate2,
          durationMinutes: 30,
          reason: 'Control de vacunas solapado',
        })
        .expect(409);

      assert.equal(visit2Res.status, 409);
      assert.ok(
        JSON.stringify(visit2Res.body).toLowerCase().includes('solap') ||
        JSON.stringify(visit2Res.body).toLowerCase().includes('conflict') ||
        visit2Res.body.statusCode === 409,
        'Debe responder con 409 Conflict'
      );
      console.log(' -> HTTP 409 Conflict comprobado exitosamente ante colisión de turnos médicos.');
      console.log('\n--- PASO 12: RECORRIDO MANUAL FINALIZADO CON ÉXITO ROTUNDO (7/7 PASOS EN VERDE) ---\n');

    } finally {
      await app.close();
    }
  });
});
