import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AccessAction,
  GrantScope,
  GrantSource,
  NotificationStatus,
  NotificationType,
  TagStatus,
} from '@prisma/client';
import { TagAbuseProtectionService } from '../../src/modules/tags/tag-abuse-protection.service';
import { TagsService } from '../../src/modules/tags/tags.service';
import { MailTransportService } from '../../src/modules/notifications/mail-transport.service';

describe('NFC Abuse Controls & Owner Notice (feat/nfc-abuse-controls)', () => {
  describe('1. TagAbuseProtectionService - Rate limiting por usuario y por clínica', () => {
    let abuseService: TagAbuseProtectionService;
    let loggedAccessLogs: any[];
    let mockAccessLogsService: any;

    beforeEach(() => {
      loggedAccessLogs = [];
      mockAccessLogsService = {
        log: async (entry: any) => {
          loggedAccessLogs.push(entry);
          return { id: `log-${loggedAccessLogs.length}`, ...entry, timestamp: new Date() };
        },
      };

      abuseService = new TagAbuseProtectionService(mockAccessLogsService);
      abuseService.setConfig({
        userLimit: 3,
        userTtlMs: 60000,
        clinicLimit: 5,
        clinicTtlMs: 60000,
        anomalyThreshold: 3,
        anomalyWindowMs: 60000,
      });
      abuseService.reset();
    });

    it('debe permitir escaneos por debajo del límite de usuario y clínica', async () => {
      const clinicId = 'clinic-1';
      const userId = 'user-1';

      await assert.doesNotReject(async () => {
        await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-1');
        await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-2');
        await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-3');
      });

      assert.strictEqual(loggedAccessLogs.length, 0);
    });

    it('debe lanzar 429 en español y registrar AccessLog al exceder límite por usuario', async () => {
      const clinicId = 'clinic-1';
      const userId = 'user-spammer';

      // 3 escaneos exitosos
      await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-1');
      await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-2');
      await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-3');

      // 4to escaneo debe lanzar 429
      let errorThrown: any = null;
      try {
        await abuseService.checkRateLimit(clinicId, userId, '127.0.0.1', 'Desktop/1.0', 'pet-4');
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown instanceof HttpException);
      assert.strictEqual(errorThrown.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      const res = errorThrown.getResponse() as { message?: string };
      assert.match(res.message || '', /Límite de escaneos NFC excedido para este usuario/);

      // Debe haberse registrado en access_logs con NFC_RATE_LIMIT_EXCEEDED
      const rateLimitLog = loggedAccessLogs.find(
        (l) => l.action === AccessAction.NFC_RATE_LIMIT_EXCEEDED && l.userId === userId,
      );
      assert.ok(rateLimitLog, 'Debe existir registro en access_logs para el usuario bloqueado');
      assert.strictEqual(rateLimitLog.clinicId, clinicId);
    });

    it('otro usuario en la misma clínica debe poder escanear si no ha alcanzado su límite', async () => {
      const clinicId = 'clinic-1';
      const userBlocked = 'user-blocked';
      const userHealthy = 'user-healthy';

      // Bloquear userBlocked (3 escaneos)
      await abuseService.checkRateLimit(clinicId, userBlocked, '127.0.0.1', 'Desktop/1.0');
      await abuseService.checkRateLimit(clinicId, userBlocked, '127.0.0.1', 'Desktop/1.0');
      await abuseService.checkRateLimit(clinicId, userBlocked, '127.0.0.1', 'Desktop/1.0');

      await assert.rejects(
        () => abuseService.checkRateLimit(clinicId, userBlocked, '127.0.0.1', 'Desktop/1.0'),
        /Límite de escaneos NFC excedido para este usuario/,
      );

      // userHealthy debe poder escanear sin problemas
      await assert.doesNotReject(async () => {
        await abuseService.checkRateLimit(clinicId, userHealthy, '127.0.0.1', 'Desktop/1.0');
      });
    });

    it('debe lanzar 429 en español y registrar AccessLog al exceder límite por clínica', async () => {
      const clinicId = 'clinic-overloaded';

      // Límite de clínica configurado en 5
      for (let i = 0; i < 5; i++) {
        await abuseService.checkRateLimit(clinicId, undefined, '127.0.0.1', 'Desktop/1.0');
      }

      // 6to escaneo de la clínica
      let errorThrown: any = null;
      try {
        await abuseService.checkRateLimit(clinicId, undefined, '127.0.0.1', 'Desktop/1.0');
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown instanceof HttpException);
      assert.strictEqual(errorThrown.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      const res = errorThrown.getResponse() as { message?: string };
      assert.match(res.message || '', /Límite de escaneos NFC excedido para esta clínica/);

      const clinicLog = loggedAccessLogs.find(
        (l) => l.action === AccessAction.NFC_RATE_LIMIT_EXCEEDED && l.clinicId === clinicId,
      );
      assert.ok(clinicLog, 'Debe existir registro en access_logs para la clínica excedida');
    });

    it('otra clínica debe poder continuar operando independientemente', async () => {
      const clinicA = 'clinic-a';
      const clinicB = 'clinic-b';

      for (let i = 0; i < 5; i++) {
        await abuseService.checkRateLimit(clinicA, undefined, '127.0.0.1', 'Desktop/1.0');
      }

      await assert.rejects(
        () => abuseService.checkRateLimit(clinicA, undefined, '127.0.0.1', 'Desktop/1.0'),
        /Límite de escaneos NFC excedido para esta clínica/,
      );

      await assert.doesNotReject(async () => {
        await abuseService.checkRateLimit(clinicB, undefined, '127.0.0.1', 'Desktop/1.0');
      });
    });
  });

  describe('2. TagAbuseProtectionService - Detección de anomalías', () => {
    let abuseService: TagAbuseProtectionService;
    let loggedAccessLogs: any[];
    let mockAccessLogsService: any;

    beforeEach(() => {
      loggedAccessLogs = [];
      mockAccessLogsService = {
        log: async (entry: any) => {
          loggedAccessLogs.push(entry);
          return { id: `log-${loggedAccessLogs.length}`, ...entry, timestamp: new Date() };
        },
      };

      abuseService = new TagAbuseProtectionService(mockAccessLogsService);
      // Umbral: más de 2 mascotas distintas dispara anomalía
      abuseService.setConfig({
        anomalyThreshold: 2,
        anomalyWindowMs: 60000,
      });
      abuseService.reset();
    });

    it('no debe disparar alerta si se resuelven mascotas distintas por debajo del umbral', async () => {
      const clinicId = 'clinic-normal';

      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-1');
      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-2');

      const anomalyLogs = loggedAccessLogs.filter((l) => l.action === AccessAction.NFC_SCAN_ANOMALY);
      assert.strictEqual(anomalyLogs.length, 0);
    });

    it('debe disparar log de auditoría NFC_SCAN_ANOMALY sin bloquear la atención al superar umbral', async () => {
      const clinicId = 'clinic-suspicious';

      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-1');
      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-2');
      // 3ra mascota distinta > umbral 2
      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-3', 'vet-user', '10.0.0.1', 'Agent/1');

      const anomalyLogs = loggedAccessLogs.filter((l) => l.action === AccessAction.NFC_SCAN_ANOMALY);
      assert.strictEqual(anomalyLogs.length, 1);
      assert.strictEqual(anomalyLogs[0].clinicId, clinicId);
      assert.strictEqual(anomalyLogs[0].petId, 'pet-3');
      assert.strictEqual(anomalyLogs[0].userId, 'vet-user');
    });

    it('resolver la misma mascota varias veces no debe sumar mascotas distintas', async () => {
      const clinicId = 'clinic-repeat';

      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-1');
      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-1');
      await abuseService.recordAndCheckAnomaly(clinicId, 'pet-1');

      const anomalyLogs = loggedAccessLogs.filter((l) => l.action === AccessAction.NFC_SCAN_ANOMALY);
      assert.strictEqual(anomalyLogs.length, 0);
    });
  });

  describe('3. TagsService - Aviso al dueño y no interferencia médica', () => {
    let tagsService: TagsService;
    let mockPrisma: any;
    let mockAccessLogsService: any;
    let mockAccessGrantsService: any;
    let abuseService: TagAbuseProtectionService;
    let mailTransportService: MailTransportService;
    let sentMails: Array<{ recipient: string; subject: string; content: string }>;
    let notificationsDb: any[];

    const clinicOriginId = 'clinic-origin-1111';
    const clinicScanningId = 'clinic-scanner-2222';
    const userId = 'user-vet-9999';
    const petId = 'pet-dog-7777';
    const tagUid = '04AAC318CEE9';

    beforeEach(() => {
      sentMails = [];
      notificationsDb = [];

      mailTransportService = new MailTransportService();
      // Interceptar send para pruebas
      mailTransportService.send = async (recipient: string, subject: string, content: string) => {
        sentMails.push({ recipient, subject, content });
        return true;
      };

      mockAccessLogsService = {
        log: async () => ({ id: 'log-1' }),
      };

      mockAccessGrantsService = {
        grantAccess: async () => ({
          id: 'grant-1',
          petId,
          clinicId: clinicScanningId,
          scope: GrantScope.FULL_HISTORY,
          source: GrantSource.NFC_TAP,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        }),
      };

      abuseService = new TagAbuseProtectionService(mockAccessLogsService);

      mockPrisma = {
        tag: {
          findFirst: async () => ({
            id: 'tag-1',
            uid: tagUid,
            publicCode: 'code-123',
            status: TagStatus.ACTIVE,
            deletedAt: null,
            petId,
            pet: {
              id: petId,
              name: 'Firulais',
              species: 'Canino',
              breed: 'Golden Retriever',
              createdByClinicId: clinicOriginId,
              deletedAt: null,
              ownerId: 'owner-1',
              owner: {
                id: 'owner-1',
                name: 'Juan',
                lastName: 'Pérez',
                email: 'juan.perez@example.com',
                phone: '+593998765432',
                documentId: '1712345678',
                address: 'Av. Siempreviva 742',
              },
            },
          }),
        },
        clinic: {
          findUnique: async (args: any) => {
            if (args.where.id === clinicScanningId) {
              return { id: clinicScanningId, name: 'Clínica Veterinaria San José' };
            }
            if (args.where.id === clinicOriginId) {
              return { id: clinicOriginId, name: 'Clínica Origen Central' };
            }
            return null;
          },
        },
        clinicOwner: {
          findUnique: async () => null,
          upsert: async () => ({ id: 'co-1' }),
        },
        clinicPatient: {
          findUnique: async () => null,
        },
        notification: {
          findUnique: async (args: any) => {
            return notificationsDb.find((n) => n.idempotencyKey === args.where.idempotencyKey) || null;
          },
          create: async (args: any) => {
            const existing = notificationsDb.find((n) => n.idempotencyKey === args.data.idempotencyKey);
            if (existing) {
              const err: any = new Error('Unique constraint failed');
              err.code = 'P2002';
              throw err;
            }
            const record = {
              id: `notif-${notificationsDb.length + 1}`,
              ...args.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            notificationsDb.push(record);
            return record;
          },
          update: async (args: any) => {
            const index = notificationsDb.findIndex((n) => n.id === args.where.id);
            if (index !== -1) {
              notificationsDb[index] = { ...notificationsDb[index], ...args.data, updatedAt: new Date() };
              return notificationsDb[index];
            }
            return null;
          },
        },
        $transaction: async (cb: any) => cb(mockPrisma),
      };

      tagsService = new TagsService(
        mockPrisma,
        mockAccessLogsService,
        mockAccessGrantsService,
        abuseService,
        mailTransportService,
      );
    });

    it('escaneo cross-clínica debe enviar aviso al dueño con contenido mínimo y sin datos clínicos', async () => {
      const result = await tagsService.resolveUid(tagUid, clinicScanningId, userId);

      assert.strictEqual(result.registered, true);
      assert.strictEqual(result.hasFullAccess, true);
      assert.strictEqual(result.pet.name, 'Firulais');

      // Dar tiempo para que la promesa asíncrona se procese
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.recipient, 'juan.perez@example.com');
      assert.match(mail.subject, /Firulais/);
      assert.match(mail.content, /Firulais/);
      assert.match(mail.content, /Clínica Veterinaria San José/);

      // Verificación estricta de privacidad: CERO datos clínicos, CERO documento, CERO dirección
      assert.doesNotMatch(mail.content, /1712345678/, 'No debe incluir número de cédula/documento');
      assert.doesNotMatch(mail.content, /Av\. Siempreviva/, 'No debe incluir dirección física');
      assert.doesNotMatch(mail.content, /Golden Retriever|vacunas|consulta|diagnóstico/i);

      // Verificación en base de datos de notificaciones
      assert.strictEqual(notificationsDb.length, 1);
      assert.strictEqual(notificationsDb[0].type, NotificationType.NFC_SCAN_ALERT);
      assert.strictEqual(notificationsDb[0].status, NotificationStatus.SENT);
    });

    it('idempotencia: segundo escaneo el mismo día por la misma clínica no debe reenviar correo', async () => {
      await tagsService.resolveUid(tagUid, clinicScanningId, userId);
      await new Promise((r) => setTimeout(r, 50));
      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(notificationsDb.length, 1);

      // Segundo escaneo el mismo día
      await tagsService.resolveUid(tagUid, clinicScanningId, userId);
      await new Promise((r) => setTimeout(r, 50));

      // Sigue habiendo un solo correo enviado y una sola notificación en DB
      assert.strictEqual(sentMails.length, 1, 'No debe emitir segundo correo el mismo día');
      assert.strictEqual(notificationsDb.length, 1);
    });

    it('escaneo en la clínica de origen no debe enviar aviso al dueño', async () => {
      // Escaneo en clinicOriginId (misma que createdByClinicId)
      const result = await tagsService.resolveUid(tagUid, clinicOriginId, userId);

      assert.strictEqual(result.registered, true);
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(sentMails.length, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });

    it('si el dueño no tiene email registrado, no debe fallar ni intentar enviar correo', async () => {
      // Modificar dueño para que no tenga email
      mockPrisma.tag.findFirst = async () => ({
        id: 'tag-1',
        uid: tagUid,
        publicCode: 'code-123',
        status: TagStatus.ACTIVE,
        deletedAt: null,
        petId,
        pet: {
          id: petId,
          name: 'Firulais',
          createdByClinicId: clinicOriginId,
          deletedAt: null,
          ownerId: 'owner-no-email',
          owner: {
            id: 'owner-no-email',
            name: 'Carlos',
            lastName: 'Sin Mail',
            email: null,
            phone: '+593991112233',
          },
        },
      });

      const result = await tagsService.resolveUid(tagUid, clinicScanningId, userId);

      assert.strictEqual(result.registered, true);
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(sentMails.length, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });

    it('si el transporte de correo falla, el escaneo y atención médica deben ser exitosos (no bloqueante)', async () => {
      // Configurar transporte para fallar
      mailTransportService.send = async () => {
        throw new Error('Conexión SMTP rechazada / timeout de red');
      };

      const result = await tagsService.resolveUid(tagUid, clinicScanningId, userId);

      // El resultado médico es 100% exitoso
      assert.strictEqual(result.registered, true);
      assert.strictEqual(result.hasFullAccess, true);
      assert.strictEqual(result.pet.name, 'Firulais');

      await new Promise((r) => setTimeout(r, 50));

      // La notificación en DB quedó registrada como FAILED sin romper el flujo
      assert.strictEqual(notificationsDb.length, 1);
      assert.strictEqual(notificationsDb[0].status, NotificationStatus.FAILED);
      assert.match(notificationsDb[0].errorMessage, /timeout de red/);
    });
  });
});
