import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'crypto';
import { NotificationStatus, NotificationType, VisitStatus } from '@prisma/client';
import { NotificationSchedulerService } from '../../src/modules/notifications/notification-scheduler.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';

interface MockOwner {
  id: string;
  email: string | null;
  phone: string;
  deletedAt: Date | null;
}

interface MockPet {
  id: string;
  name: string;
  ownerId: string;
  deletedAt: Date | null;
  owner?: MockOwner;
}

interface MockVisit {
  id: string;
  clinicId: string;
  vetId: string;
  petId: string;
  reason: string;
  scheduledDate: Date;
  status: VisitStatus;
  deletedAt: Date | null;
  pet?: MockPet;
}

interface MockVaccination {
  id: string;
  petId: string;
  clinicId: string | null;
  vetId: string | null;
  vaccineName: string;
  appliedAt: Date;
  nextDueDate: Date | null;
  deletedAt: Date | null;
  pet?: MockPet;
}

interface MockNotification {
  id: string;
  idempotencyKey: string;
  type: NotificationType;
  entityId: string;
  recipient: string;
  targetDate: Date;
  status: NotificationStatus;
  retryCount: number;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('NotificationSchedulerService & NotificationsService - T24 (RF-51, RF-52, RF-53)', () => {
  let schedulerService: NotificationSchedulerService;
  let notificationsService: NotificationsService;

  let notificationsDb: MockNotification[];
  let visitsDb: MockVisit[];
  let vaccinationsDb: MockVaccination[];

  let mockPrisma: any;

  beforeEach(() => {
    notificationsDb = [];
    visitsDb = [];
    vaccinationsDb = [];

    mockPrisma = {
      notification: {
        findUnique: (args: { where: { idempotencyKey: string } }) => {
          const match = notificationsDb.find(
            (n) => n.idempotencyKey === args.where.idempotencyKey,
          );
          return Promise.resolve(match ? { ...match } : null);
        },
        create: (args: { data: any }) => {
          const existing = notificationsDb.find(
            (n) => n.idempotencyKey === args.data.idempotencyKey,
          );
          if (existing) {
            const error: any = new Error('Unique constraint failed on the fields: (`idempotencyKey`)');
            error.code = 'P2002';
            return Promise.reject(error);
          }
          const created: MockNotification = {
            id: `notif-${notificationsDb.length + 1}`,
            idempotencyKey: args.data.idempotencyKey,
            type: args.data.type,
            entityId: args.data.entityId,
            recipient: args.data.recipient,
            targetDate: args.data.targetDate,
            status: args.data.status ?? NotificationStatus.PENDING,
            retryCount: args.data.retryCount ?? 0,
            errorMessage: null,
            sentAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          notificationsDb.push(created);
          return Promise.resolve({ ...created });
        },
        findMany: (args?: any) => {
          return Promise.resolve([...notificationsDb]);
        },
      },
      visit: {
        findMany: (args: any) => {
          let results = visitsDb.filter((v) => {
            if (args.where?.deletedAt === null && v.deletedAt !== null) return false;
            if (args.where?.status && v.status !== args.where.status) return false;
            if (args.where?.scheduledDate) {
              const dateVal = v.scheduledDate.getTime();
              if (args.where.scheduledDate.gte && dateVal < args.where.scheduledDate.gte.getTime()) return false;
              if (args.where.scheduledDate.lte && dateVal > args.where.scheduledDate.lte.getTime()) return false;
            }
            return true;
          });
          return Promise.resolve(results);
        },
      },
      vaccination: {
        findMany: (args: any) => {
          let results = vaccinationsDb.filter((vac) => {
            if (args.where?.deletedAt === null && vac.deletedAt !== null) return false;
            if (args.where?.nextDueDate) {
              if (!vac.nextDueDate) return false;
              const dateVal = vac.nextDueDate.getTime();
              if (args.where.nextDueDate.gte && dateVal < args.where.nextDueDate.gte.getTime()) return false;
              if (args.where.nextDueDate.lte && dateVal > args.where.nextDueDate.lte.getTime()) return false;
            }
            return true;
          });
          return Promise.resolve(results);
        },
      },
    };

    notificationsService = new NotificationsService(mockPrisma);
    schedulerService = new NotificationSchedulerService(mockPrisma, notificationsService);
  });

  describe('1. Generación determinista de clave de idempotencia (RF-53)', () => {
    it('debe generar un hash SHA-256 compuesto determinista a partir de tipo, entityId y targetDate ISO', () => {
      const type = NotificationType.VISIT_REMINDER;
      const entityId = 'visit-uuid-123';
      const targetDate = new Date('2026-10-21T10:00:00.000Z');

      const expectedRaw = `${type}:${entityId}:${targetDate.toISOString()}`;
      const expectedHash = crypto.createHash('sha256').update(expectedRaw).digest('hex');

      const keyFromService = notificationsService.generateIdempotencyKey(type, entityId, targetDate);
      const keyFromScheduler = schedulerService.generateIdempotencyKey(type, entityId, targetDate);

      assert.strictEqual(keyFromService, expectedHash);
      assert.strictEqual(keyFromScheduler, expectedHash);
      assert.strictEqual(keyFromService.length, 64);
    });

    it('debe producir claves distintas si varía el tipo, el entityId o la fecha objetivo', () => {
      const date1 = new Date('2026-10-21T10:00:00.000Z');
      const date2 = new Date('2026-10-21T11:00:00.000Z');

      const key1 = notificationsService.generateIdempotencyKey(NotificationType.VISIT_REMINDER, 'entity-1', date1);
      const key2 = notificationsService.generateIdempotencyKey(NotificationType.VACCINE_ALERT, 'entity-1', date1);
      const key3 = notificationsService.generateIdempotencyKey(NotificationType.VISIT_REMINDER, 'entity-2', date1);
      const key4 = notificationsService.generateIdempotencyKey(NotificationType.VISIT_REMINDER, 'entity-1', date2);

      assert.notStrictEqual(key1, key2);
      assert.notStrictEqual(key1, key3);
      assert.notStrictEqual(key1, key4);
    });
  });

  describe('2. Idempotencia y descarte silencioso en encolado (RF-53)', () => {
    it('debe encolar una notificación si no existe previamente', async () => {
      const targetDate = new Date('2026-10-21T10:00:00.000Z');
      const result = await notificationsService.queueNotification({
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-1',
        recipient: 'owner@example.com',
        targetDate,
      });

      assert.ok(result);
      assert.strictEqual(result.type, NotificationType.VISIT_REMINDER);
      assert.strictEqual(result.entityId, 'visit-1');
      assert.strictEqual(result.recipient, 'owner@example.com');
      assert.strictEqual(result.status, NotificationStatus.PENDING);
      assert.strictEqual(result.retryCount, 0);
      assert.strictEqual(notificationsDb.length, 1);
    });

    it('debe descartar silenciosamente y retornar null ante ejecuciones repetidas con la misma clave (RF-53)', async () => {
      const targetDate = new Date('2026-10-21T10:00:00.000Z');

      const first = await notificationsService.queueNotification({
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-1',
        recipient: 'owner@example.com',
        targetDate,
      });
      assert.ok(first);
      assert.strictEqual(notificationsDb.length, 1);

      const second = await notificationsService.queueNotification({
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-1',
        recipient: 'owner@example.com',
        targetDate,
      });
      assert.strictEqual(second, null);
      assert.strictEqual(notificationsDb.length, 1, 'No debe insertar duplicados en base de datos');

      const third = await schedulerService.queueNotification({
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-1',
        recipient: 'owner@example.com',
        targetDate,
      });
      assert.strictEqual(third, null);
      assert.strictEqual(notificationsDb.length, 1, 'No debe insertar duplicados vía scheduler');
    });
  });

  describe('3. Identificación y encolado de recordatorios de citas a 72h (RF-51)', () => {
    const baseNow = new Date('2026-10-18T10:00:00.000Z');

    it('debe identificar visitas SCHEDULED en la ventana de 72 horas y encolar recordatorios con email o teléfono del dueño', async () => {
      // 72 horas después de baseNow es 2026-10-21T10:00:00.000Z
      const scheduled72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      visitsDb.push({
        id: 'visit-72h',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        petId: 'pet-1',
        reason: 'Control anual',
        scheduledDate: scheduled72h,
        status: VisitStatus.SCHEDULED,
        deletedAt: null,
        pet: {
          id: 'pet-1',
          name: 'Firulais',
          ownerId: 'owner-1',
          deletedAt: null,
          owner: {
            id: 'owner-1',
            email: 'owner@vet.com',
            phone: '+593991234567',
            deletedAt: null,
          },
        },
      });

      const count = await schedulerService.scheduleVisitReminders(baseNow);

      assert.strictEqual(count, 1);
      assert.strictEqual(notificationsDb.length, 1);
      assert.strictEqual(notificationsDb[0].type, NotificationType.VISIT_REMINDER);
      assert.strictEqual(notificationsDb[0].entityId, 'visit-72h');
      assert.strictEqual(notificationsDb[0].recipient, 'owner@vet.com');
      assert.strictEqual(notificationsDb[0].targetDate.toISOString(), scheduled72h.toISOString());
    });

    it('debe usar el teléfono del dueño si el email no está disponible', async () => {
      const scheduled72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      visitsDb.push({
        id: 'visit-phone-only',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        petId: 'pet-2',
        reason: 'Vacunación',
        scheduledDate: scheduled72h,
        status: VisitStatus.SCHEDULED,
        deletedAt: null,
        pet: {
          id: 'pet-2',
          name: 'Michi',
          ownerId: 'owner-2',
          deletedAt: null,
          owner: {
            id: 'owner-2',
            email: null,
            phone: '+593998888888',
            deletedAt: null,
          },
        },
      });

      const count = await schedulerService.scheduleVisitReminders(baseNow);

      assert.strictEqual(count, 1);
      assert.strictEqual(notificationsDb[0].recipient, '+593998888888');
    });

    it('debe ignorar visitas que no estén en estado SCHEDULED (e.g. CANCELLED, PENDING)', async () => {
      const scheduled72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      visitsDb.push({
        id: 'visit-cancelled',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        petId: 'pet-1',
        reason: 'Cancelada',
        scheduledDate: scheduled72h,
        status: VisitStatus.CANCELLED,
        deletedAt: null,
        pet: {
          id: 'pet-1',
          name: 'Firulais',
          ownerId: 'owner-1',
          deletedAt: null,
          owner: {
            id: 'owner-1',
            email: 'owner@vet.com',
            phone: '+593991234567',
            deletedAt: null,
          },
        },
      });

      const count = await schedulerService.scheduleVisitReminders(baseNow);
      assert.strictEqual(count, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });

    it('debe ignorar visitas fuera de la ventana objetivo de 72h (+/- 1h)', async () => {
      // 24 horas (demasiado pronto)
      const date24h = new Date(baseNow.getTime() + 24 * 60 * 60 * 1000);
      // 96 horas (demasiado tarde)
      const date96h = new Date(baseNow.getTime() + 96 * 60 * 60 * 1000);

      visitsDb.push(
        {
          id: 'visit-24h',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          petId: 'pet-1',
          reason: 'Cita en 24h',
          scheduledDate: date24h,
          status: VisitStatus.SCHEDULED,
          deletedAt: null,
          pet: {
            id: 'pet-1',
            name: 'Firulais',
            ownerId: 'owner-1',
            deletedAt: null,
            owner: { id: 'owner-1', email: 'o@test.com', phone: '123', deletedAt: null },
          },
        },
        {
          id: 'visit-96h',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          petId: 'pet-1',
          reason: 'Cita en 96h',
          scheduledDate: date96h,
          status: VisitStatus.SCHEDULED,
          deletedAt: null,
          pet: {
            id: 'pet-1',
            name: 'Firulais',
            ownerId: 'owner-1',
            deletedAt: null,
            owner: { id: 'owner-1', email: 'o@test.com', phone: '123', deletedAt: null },
          },
        },
      );

      const count = await schedulerService.scheduleVisitReminders(baseNow);
      assert.strictEqual(count, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });

    it('debe ignorar visitas con borrado lógico o sin datos de contacto del dueño', async () => {
      const scheduled72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      visitsDb.push(
        {
          id: 'visit-deleted',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          petId: 'pet-1',
          reason: 'Eliminada',
          scheduledDate: scheduled72h,
          status: VisitStatus.SCHEDULED,
          deletedAt: new Date(),
          pet: {
            id: 'pet-1',
            name: 'Firulais',
            ownerId: 'owner-1',
            deletedAt: null,
            owner: { id: 'owner-1', email: 'o@test.com', phone: '123', deletedAt: null },
          },
        },
        {
          id: 'visit-no-contact',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          petId: 'pet-2',
          reason: 'Sin contacto',
          scheduledDate: scheduled72h,
          status: VisitStatus.SCHEDULED,
          deletedAt: null,
          pet: {
            id: 'pet-2',
            name: 'Mascota 2',
            ownerId: 'owner-2',
            deletedAt: null,
            owner: { id: 'owner-2', email: null, phone: '', deletedAt: null },
          },
        },
      );

      const count = await schedulerService.scheduleVisitReminders(baseNow);
      assert.strictEqual(count, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });
  });

  describe('4. Identificación y encolado de alertas de revacunación a 72h (RF-52)', () => {
    const baseNow = new Date('2026-10-18T10:00:00.000Z');

    it('debe identificar vacunas con nextDueDate a 72h y encolar alerta sanitaria dirigida al dueño', async () => {
      const due72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      vaccinationsDb.push({
        id: 'vac-72h',
        petId: 'pet-1',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        vaccineName: 'Rabia Anual',
        appliedAt: new Date('2025-10-21T10:00:00.000Z'),
        nextDueDate: due72h,
        deletedAt: null,
        pet: {
          id: 'pet-1',
          name: 'Firulais',
          ownerId: 'owner-1',
          deletedAt: null,
          owner: {
            id: 'owner-1',
            email: 'vaccines@owner.com',
            phone: '+593991234567',
            deletedAt: null,
          },
        },
      });

      const count = await schedulerService.scheduleVaccineAlerts(baseNow);

      assert.strictEqual(count, 1);
      assert.strictEqual(notificationsDb.length, 1);
      assert.strictEqual(notificationsDb[0].type, NotificationType.VACCINE_ALERT);
      assert.strictEqual(notificationsDb[0].entityId, 'vac-72h');
      assert.strictEqual(notificationsDb[0].recipient, 'vaccines@owner.com');
      assert.strictEqual(notificationsDb[0].targetDate.toISOString(), due72h.toISOString());
    });

    it('debe ignorar vacunas sin nextDueDate o con borrado lógico', async () => {
      const due72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      vaccinationsDb.push(
        {
          id: 'vac-no-due',
          petId: 'pet-1',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          vaccineName: 'Dosis única',
          appliedAt: new Date(),
          nextDueDate: null,
          deletedAt: null,
          pet: {
            id: 'pet-1',
            name: 'Firulais',
            ownerId: 'owner-1',
            deletedAt: null,
            owner: { id: 'owner-1', email: 'o@test.com', phone: '123', deletedAt: null },
          },
        },
        {
          id: 'vac-deleted',
          petId: 'pet-1',
          clinicId: 'clinic-1',
          vetId: 'vet-1',
          vaccineName: 'Eliminada',
          appliedAt: new Date(),
          nextDueDate: due72h,
          deletedAt: new Date(),
          pet: {
            id: 'pet-1',
            name: 'Firulais',
            ownerId: 'owner-1',
            deletedAt: null,
            owner: { id: 'owner-1', email: 'o@test.com', phone: '123', deletedAt: null },
          },
        },
      );

      const count = await schedulerService.scheduleVaccineAlerts(baseNow);
      assert.strictEqual(count, 0);
      assert.strictEqual(notificationsDb.length, 0);
    });
  });

  describe('5. Ejecución consolidada del scheduler (runScheduler)', () => {
    it('debe ejecutar recordatorios y alertas consolidando el conteo de notificaciones encoladas', async () => {
      const baseNow = new Date('2026-10-18T10:00:00.000Z');
      const target72h = new Date(baseNow.getTime() + 72 * 60 * 60 * 1000);

      visitsDb.push({
        id: 'visit-1',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        petId: 'pet-1',
        reason: 'Consulta general',
        scheduledDate: target72h,
        status: VisitStatus.SCHEDULED,
        deletedAt: null,
        pet: {
          id: 'pet-1',
          name: 'Firulais',
          ownerId: 'owner-1',
          deletedAt: null,
          owner: { id: 'owner-1', email: 'owner@vet.com', phone: '123', deletedAt: null },
        },
      });

      vaccinationsDb.push({
        id: 'vac-1',
        petId: 'pet-1',
        clinicId: 'clinic-1',
        vetId: 'vet-1',
        vaccineName: 'Parvovirus',
        appliedAt: new Date(),
        nextDueDate: target72h,
        deletedAt: null,
        pet: {
          id: 'pet-1',
          name: 'Firulais',
          ownerId: 'owner-1',
          deletedAt: null,
          owner: { id: 'owner-1', email: 'owner@vet.com', phone: '123', deletedAt: null },
        },
      });

      const summary = await schedulerService.runScheduler(baseNow);

      assert.strictEqual(summary.visitReminders, 1);
      assert.strictEqual(summary.vaccineAlerts, 1);
      assert.strictEqual(summary.total, 2);
      assert.strictEqual(notificationsDb.length, 2);

      // Segunda ejecución inmediata: debido a la idempotencia, no se encolan duplicados
      const secondSummary = await schedulerService.runScheduler(baseNow);
      assert.strictEqual(secondSummary.visitReminders, 0);
      assert.strictEqual(secondSummary.vaccineAlerts, 0);
      assert.strictEqual(secondSummary.total, 0);
      assert.strictEqual(notificationsDb.length, 2, 'La base de datos conserva exactamente 2 notificaciones');
    });
  });
});
