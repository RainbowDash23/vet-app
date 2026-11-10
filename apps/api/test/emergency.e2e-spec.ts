import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { AccessAction, TagStatus } from '@prisma/client';
import {
  createTestApp,
  PET_1_ID,
  TAG_1_PUBLIC_CODE,
  TAG_1_UID,
  CLINIC_A_ID,
  OWNER_1_ID,
  USER_ADMIN_ID,
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
    let clientIpSeq = 1;
    const freshIp = () => `198.51.100.${clientIpSeq++}`;

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

      const res = await request(app.getHttpServer())
        .get(`/p/${xssCode}`)
        .set('x-forwarded-for', freshIp());

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
      const res = await request(app.getHttpServer())
        .get(`/p/${nonExistentCode}`)
        .set('x-forwarded-for', freshIp());

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
      const throttleTargetIp = '203.0.113.199';
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .get(`/p/${TAG_1_PUBLIC_CODE}`)
          .set('x-forwarded-for', throttleTargetIp);
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

      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());

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
      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());

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

    it('debe incluir cabeceras de privacidad y meta robots noindex, nofollow tanto en 200 como en 404', async () => {
      const res200 = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());
      assert.strictEqual(res200.status, 200);
      assert.strictEqual(res200.headers['x-robots-tag'], 'noindex, nofollow');
      assert.ok(res200.headers['cache-control']?.includes('no-store'), 'Debe tener Cache-Control: no-store');
      assert.ok(res200.text.includes('<meta name="robots" content="noindex, nofollow">'));

      const res404 = await request(app.getHttpServer())
        .get(`/p/${crypto.randomUUID()}`)
        .set('x-forwarded-for', freshIp());
      assert.strictEqual(res404.status, 404);
      assert.strictEqual(res404.headers['x-robots-tag'], 'noindex, nofollow');
      assert.ok(res404.headers['cache-control']?.includes('no-store'), 'Debe tener Cache-Control: no-store en 404');
      assert.ok(res404.text.includes('<meta name="robots" content="noindex, nofollow">'));
    });

    it('debe cumplir con tono sobrio en español, sin la palabra "Paciente", sin emojis y con la copia requerida', async () => {
      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.text.toLowerCase().includes('paciente'),
        false,
        'No debe contener la palabra paciente',
      );
      assert.strictEqual(
        res.text.includes('Sistema Veterinario de Rescate e Identificación'),
        false,
        'No debe contener títulos antiguos de sistema clínico',
      );
      assert.strictEqual(
        res.text.toLowerCase().includes('mascota extraviada'),
        false,
        'No debe contener "mascota extraviada"',
      );
      assert.ok(
        res.text.includes('Esta mascota tiene dueño'),
        'Debe contener título "Esta mascota tiene dueño"',
      );
      assert.ok(
        res.text.includes('Ayúdala a volver a casa: contacta a su dueño'),
        'Debe contener subtítulo cálido y claro',
      );
      assert.ok(res.text.includes('MASCOTA'), 'Debe contener badge MASCOTA');
      assert.ok(
        res.text.includes('Identificación de mascotas con llavero NFC'),
        'Debe contener pie de página requerido',
      );

      // Cero emojis en el HTML resultante
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      assert.strictEqual(emojiRegex.test(res.text), false, 'No debe contener emojis');
    });

    it('debe traducir especie y sexo al español y nunca mostrar enums en crudo (CANINE, MALE, etc.)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('Perro'), 'Debe mostrar especie traducida (Perro)');
      assert.ok(res.text.includes('Macho'), 'Debe mostrar sexo traducido (Macho)');
      assert.strictEqual(res.text.includes('CANINE'), false, 'No debe mostrar enum CANINE');
      assert.strictEqual(res.text.includes('MALE'), false, 'No debe mostrar enum MALE');
      assert.strictEqual(res.text.includes('FELINE'), false, 'No debe mostrar enum FELINE');
      assert.strictEqual(res.text.includes('FEMALE'), false, 'No debe mostrar enum FEMALE');
    });

    it('debe generar botones táctiles accesibles (min-height 48px) de Llamar (tel:) y WhatsApp (wa.me) para teléfono internacional válido', async () => {
      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('href="tel:+593991234567"'), 'Debe incluir enlace tel:');
      assert.ok(
        res.text.includes('href="https://wa.me/593991234567"'),
        'Debe incluir enlace https://wa.me/ con dígitos',
      );
      assert.ok(res.text.includes('Llamar'), 'Debe incluir texto Llamar');
      assert.ok(res.text.includes('Escribir por WhatsApp'), 'Debe incluir texto Escribir por WhatsApp');
      assert.ok(res.text.includes('min-height: 48px'), 'Debe asegurar accesibilidad táctil min 48px');
    });

    it('debe omitir el botón de WhatsApp cuando el teléfono no tiene prefijo internacional (+)', async () => {
      const natOwnerId = crypto.randomUUID();
      const natPetId = crypto.randomUUID();
      const natCode = crypto.randomUUID();

      db.owners.push({
        id: natOwnerId,
        documentId: 'NAT123456',
        name: 'Laura',
        lastName: 'Pérez',
        phone: '0991234567', // Teléfono local/nacional sin '+'
        email: 'laura@test.com',
        address: 'Av. Local 100',
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.pets.push({
        id: natPetId,
        name: 'Luna',
        species: 'FELINE',
        breed: 'Siamés',
        birthDate: new Date('2021-01-01'),
        reproductiveStatus: 'INTACT',
        sex: 'FEMALE',
        ownerId: natOwnerId,
        createdByClinicId: CLINIC_A_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'NATPHONE00112',
        publicCode: natCode,
        status: TagStatus.ACTIVE,
        petId: natPetId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/p/${natCode}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('href="tel:0991234567"'), 'Debe incluir botón Llamar');
      assert.strictEqual(
        res.text.includes('https://wa.me/'),
        false,
        'No debe incluir enlace WhatsApp si no tiene formato internacional (+)',
      );
      assert.ok(res.text.includes('Gato'), 'Debe traducir FELINE a Gato');
      assert.ok(res.text.includes('Hembra'), 'Debe traducir FEMALE a Hembra');
    });

    it('no debe mostrar botones rotos si el teléfono del dueño es placeholder o inválido', async () => {
      const phClinicId = crypto.randomUUID();
      db.clinics.push({
        id: phClinicId,
        name: 'Clínica Sin Teléfono',
        code: 'CLINIC-PH1',
        address: 'Zona Cero',
        phone: '+000000000', // Placeholder
        email: 'ph1@clinic.com',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const phOwnerId = crypto.randomUUID();
      const phPetId = crypto.randomUUID();
      const phCode = crypto.randomUUID();

      db.owners.push({
        id: phOwnerId,
        documentId: 'PH123456',
        name: 'Pedro',
        lastName: 'Placeholder',
        phone: '+000000000', // Placeholder
        email: 'pedro@test.com',
        address: 'Calle Falsa',
        createdByClinicId: phClinicId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.pets.push({
        id: phPetId,
        name: 'Rocky',
        species: 'CANINE',
        breed: null,
        birthDate: new Date('2022-01-01'),
        reproductiveStatus: 'INTACT',
        sex: null,
        ownerId: phOwnerId,
        createdByClinicId: phClinicId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.visits.push({
        id: crypto.randomUUID(),
        clinicId: phClinicId,
        vetId: USER_ADMIN_ID,
        petId: phPetId,
        reason: 'Consulta inicial',
        status: 'COMPLETED',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'PHPHONE00112',
        publicCode: phCode,
        status: TagStatus.ACTIVE,
        petId: phPetId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/p/${phCode}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.text.includes('class="btn-action btn-call"'), false, 'No debe mostrar botón Llamar del dueño');
      assert.strictEqual(res.text.includes('href="tel:'), false, 'No debe mostrar ningún botón tel: roto');
      assert.strictEqual(res.text.includes('https://wa.me/'), false, 'No debe mostrar botón wa.me roto');
      assert.ok(
        res.text.includes('Teléfono de contacto no disponible'),
        'Debe informar con claridad sobria que el teléfono no está disponible',
      );
    });

    it('debe mostrar el bloque de clínica de referencia SOLO si tiene teléfono válido y omitirlo si es placeholder', async () => {
      // Caso 1: Con clínica válida (TAG_1_PUBLIC_CODE usa CLINIC_A_ID que tiene teléfono +1234567890)
      const resValida = await request(app.getHttpServer())
        .get(`/p/${TAG_1_PUBLIC_CODE}`)
        .set('x-forwarded-for', freshIp());
      assert.strictEqual(resValida.status, 200);
      assert.ok(resValida.text.includes('Clínica de referencia'), 'Debe mostrar clínica con teléfono válido');
      assert.ok(resValida.text.includes('Clínica Veterinaria Central'));
      assert.strictEqual(
        resValida.text.toLowerCase().includes('policía ambiental'),
        false,
        'Cero número de policía ambiental',
      );

      // Caso 2: Clínica con teléfono placeholder +000000000
      const clinicPhId = crypto.randomUUID();
      db.clinics.push({
        id: clinicPhId,
        name: 'Clínica Sin Teléfono',
        code: 'CLINIC-PH2',
        address: 'Zona Cero',
        phone: '+000000000', // Placeholder
        email: 'ph2@clinic.com',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ownerPhClinicId = crypto.randomUUID();
      const petPhClinicId = crypto.randomUUID();
      const codePhClinic = crypto.randomUUID();

      db.owners.push({
        id: ownerPhClinicId,
        documentId: 'DOCPHC',
        name: 'Ana',
        lastName: 'Ríos',
        phone: '+593988888888',
        email: 'ana@test.com',
        address: 'Calle Real',
        createdByClinicId: clinicPhId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.pets.push({
        id: petPhClinicId,
        name: 'Bella',
        species: 'CANINE',
        breed: 'Poodle',
        birthDate: new Date('2021-03-01'),
        reproductiveStatus: 'INTACT',
        sex: 'FEMALE',
        ownerId: ownerPhClinicId,
        createdByClinicId: clinicPhId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.visits.push({
        id: crypto.randomUUID(),
        clinicId: clinicPhId,
        vetId: USER_ADMIN_ID,
        petId: petPhClinicId,
        reason: 'Consulta de control',
        status: 'COMPLETED',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      db.tags.push({
        id: crypto.randomUUID(),
        uid: 'PHCLINIC00112',
        publicCode: codePhClinic,
        status: TagStatus.ACTIVE,
        petId: petPhClinicId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const resPhClinic = await request(app.getHttpServer())
        .get(`/p/${codePhClinic}`)
        .set('x-forwarded-for', freshIp());
      assert.strictEqual(resPhClinic.status, 200);
      assert.strictEqual(
        resPhClinic.text.includes('Clínica de referencia'),
        false,
        'No debe mostrar bloque de clínica si su teléfono es placeholder',
      );
      assert.strictEqual(
        resPhClinic.text.includes('+000000000'),
        false,
        'No debe aparecer teléfono placeholder de la clínica',
      );
    });

    it('debe responder HTTP 404 ante una búsqueda con UID físico de chip en vez de publicCode', async () => {
      // TAG_1_UID es el UID físico del chip ('04A1B2C3D4E5'), no es el publicCode
      const res = await request(app.getHttpServer())
        .get(`/p/${TAG_1_UID}`)
        .set('x-forwarded-for', freshIp());

      assert.strictEqual(res.status, 404, 'La ruta pública /p/ solo debe aceptar publicCode (UUID), nunca el UID físico');
      assert.strictEqual(res.headers['x-robots-tag'], 'noindex, nofollow');
      assert.ok(res.headers['cache-control']?.includes('no-store'));
      assert.ok(res.text.includes('<meta name="robots" content="noindex, nofollow">'));
    });
  });
});
