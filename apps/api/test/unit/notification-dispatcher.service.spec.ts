import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { NotificationStatus, NotificationType } from '@prisma/client';
import {
  NotificationDispatcherService,
  RETRY_DELAYS_MS,
  MAX_RETRIES,
  NotificationDispatchResult,
  DispatchBatchSummary,
} from '../../src/modules/notifications/notification-dispatcher.service';
import { MailTransportService } from '../../src/modules/notifications/mail-transport.service';

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

describe('NotificationDispatcherService & MailTransportService - T25 (RF-54)', () => {
  let dispatcherService: NotificationDispatcherService;
  let mailTransportService: MailTransportService;
  let notificationsDb: MockNotification[];
  let mockPrisma: any;

  beforeEach(() => {
    notificationsDb = [];

    mockPrisma = {
      notification: {
        findMany: (args?: any) => {
          let results = [...notificationsDb];
          if (args?.where?.status) {
            results = results.filter((n) => n.status === args.where.status);
          }
          if (args?.orderBy?.createdAt === 'asc') {
            results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
          if (typeof args?.take === 'number') {
            results = results.slice(0, args.take);
          }
          return Promise.resolve(results.map((n) => ({ ...n })));
        },
        update: (args: { where: { id: string }; data: any }) => {
          const index = notificationsDb.findIndex((n) => n.id === args.where.id);
          if (index === -1) {
            return Promise.reject(new Error(`Notification not found: ${args.where.id}`));
          }
          const current = notificationsDb[index];
          const updated: MockNotification = {
            ...current,
            ...args.data,
            updatedAt: new Date(),
          };
          notificationsDb[index] = updated;
          return Promise.resolve({ ...updated });
        },
      },
    };

    mailTransportService = new MailTransportService();
    dispatcherService = new NotificationDispatcherService(mockPrisma, mailTransportService);
  });

  describe('1. Constantes y cálculo de retardos de retroceso exponencial (RF-54)', () => {
    it('debe definir MAX_RETRIES exactamente en 3', () => {
      assert.strictEqual(MAX_RETRIES, 3);
      assert.strictEqual(dispatcherService.maxRetries, 3);
    });

    it('debe definir RETRY_DELAYS_MS con 1 min, 5 min y 15 min exactos', () => {
      assert.deepStrictEqual(RETRY_DELAYS_MS, [60_000, 300_000, 900_000]);
      assert.strictEqual(RETRY_DELAYS_MS[0], 60_000, 'Primer reintento: 1 minuto (60.000 ms)');
      assert.strictEqual(RETRY_DELAYS_MS[1], 300_000, 'Segundo reintento: 5 minutos (300.000 ms)');
      assert.strictEqual(RETRY_DELAYS_MS[2], 900_000, 'Tercer reintento: 15 minutos (900.000 ms)');
    });

    it('calculateBackoffDelay debe retornar los retardos correctos según el número de reintento', () => {
      assert.strictEqual(
        dispatcherService.calculateBackoffDelay(1),
        60_000,
        'Reintento 1 debe retornar 60.000 ms',
      );
      assert.strictEqual(
        dispatcherService.calculateBackoffDelay(2),
        300_000,
        'Reintento 2 debe retornar 300.000 ms',
      );
      assert.strictEqual(
        dispatcherService.calculateBackoffDelay(3),
        900_000,
        'Reintento 3 debe retornar 900.000 ms',
      );
      // Para valores fuera de rango o >= 3 debe devolver el retardo máximo
      assert.strictEqual(dispatcherService.calculateBackoffDelay(4), 900_000);
      assert.strictEqual(dispatcherService.calculateBackoffDelay(0), 60_000);
    });
  });

  describe('2. MailTransportService: Operación en desarrollo/test', () => {
    it('debe enviar correo simulado exitoso por defecto', async () => {
      const result = await mailTransportService.send(
        'owner@example.com',
        'Recordatorio',
        'Contenido',
      );
      assert.strictEqual(result, true);
    });

    it('debe permitir configurar simulación de fallo en transporte', async () => {
      mailTransportService.setShouldSucceed(false);
      const result = await mailTransportService.send(
        'owner@example.com',
        'Recordatorio',
        'Contenido',
      );
      assert.strictEqual(result, false);
    });
  });

  describe('3. Despacho exitoso de notificaciones en estado PENDING (RF-54)', () => {
    it('debe despachar notificación, actualizar a SENT con sentAt = now() y errorMessage = null', async () => {
      const notification: MockNotification = {
        id: 'notif-1',
        idempotencyKey: 'key-1',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-1',
        recipient: 'client@domain.com',
        targetDate: new Date('2026-10-25T10:00:00Z'),
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result: NotificationDispatchResult = await dispatcherService.dispatchNotification(notification);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, NotificationStatus.SENT);
      assert.strictEqual(result.retryCount, 0);

      // Comprobar persistencia en base de datos simulada
      const persisted = notificationsDb[0];
      assert.strictEqual(persisted.status, NotificationStatus.SENT);
      assert.ok(persisted.sentAt instanceof Date);
      assert.strictEqual(persisted.errorMessage, null);
      assert.strictEqual(persisted.retryCount, 0);
    });

    it('debe despachar notificación de tipo VACCINE_ALERT adecuadamente', async () => {
      const notification: MockNotification = {
        id: 'notif-vac-1',
        idempotencyKey: 'key-vac-1',
        type: NotificationType.VACCINE_ALERT,
        entityId: 'vac-1',
        recipient: '+1234567890',
        targetDate: new Date('2026-10-30T10:00:00Z'),
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result = await dispatcherService.dispatchNotification(notification);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, NotificationStatus.SENT);
    });
  });

  describe('4. Reintentos exponenciales y tolerancia a fallos (RF-54)', () => {
    it('debe manejar primer fallo: incrementa retryCount a 1 y status sigue PENDING', async () => {
      mailTransportService.setShouldSucceed(false);

      const notification: MockNotification = {
        id: 'notif-retry-1',
        idempotencyKey: 'key-retry-1',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-2',
        recipient: 'error@domain.com',
        targetDate: new Date(),
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result = await dispatcherService.dispatchNotification(notification);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, NotificationStatus.PENDING);
      assert.strictEqual(result.retryCount, 1);

      const persisted = notificationsDb[0];
      assert.strictEqual(persisted.status, NotificationStatus.PENDING);
      assert.strictEqual(persisted.retryCount, 1);
      assert.ok(persisted.errorMessage !== null && persisted.errorMessage.length > 0);
      assert.strictEqual(persisted.sentAt, null);
    });

    it('debe manejar segundo fallo: incrementa retryCount a 2 y status sigue PENDING', async () => {
      mailTransportService.setShouldSucceed(false);

      const notification: MockNotification = {
        id: 'notif-retry-2',
        idempotencyKey: 'key-retry-2',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-3',
        recipient: 'error@domain.com',
        targetDate: new Date(),
        status: NotificationStatus.PENDING,
        retryCount: 1, // Ya falló una vez
        errorMessage: 'Error previo',
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result = await dispatcherService.dispatchNotification(notification);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, NotificationStatus.PENDING);
      assert.strictEqual(result.retryCount, 2);

      const persisted = notificationsDb[0];
      assert.strictEqual(persisted.status, NotificationStatus.PENDING);
      assert.strictEqual(persisted.retryCount, 2);
    });

    it('debe marcar como FAILED definitivo únicamente al agotarse el tercer reintento (newRetryCount >= 3)', async () => {
      mailTransportService.setShouldSucceed(false);

      const notification: MockNotification = {
        id: 'notif-retry-3',
        idempotencyKey: 'key-retry-3',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-4',
        recipient: 'error@domain.com',
        targetDate: new Date(),
        status: NotificationStatus.PENDING,
        retryCount: 2, // Ya falló 2 veces; este es el 3er intento
        errorMessage: 'Error intento 2',
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result = await dispatcherService.dispatchNotification(notification);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, NotificationStatus.FAILED);
      assert.strictEqual(result.retryCount, 3);

      const persisted = notificationsDb[0];
      assert.strictEqual(persisted.status, NotificationStatus.FAILED);
      assert.strictEqual(persisted.retryCount, 3);
      assert.ok(persisted.errorMessage !== null);
      assert.strictEqual(persisted.sentAt, null);
    });

    it('debe capturar excepciones arrojadas por el transporte y registrarlas como error', async () => {
      // Forzar que send arroje excepción de red
      mailTransportService.send = () => {
        return Promise.reject(new Error('SMTP Connection Timeout ETIMEDOUT'));
      };

      const notification: MockNotification = {
        id: 'notif-exc-1',
        idempotencyKey: 'key-exc-1',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'visit-5',
        recipient: 'client@timeout.com',
        targetDate: new Date(),
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notificationsDb.push(notification);

      const result = await dispatcherService.dispatchNotification(notification);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, NotificationStatus.PENDING);
      assert.strictEqual(result.retryCount, 1);

      const persisted = notificationsDb[0];
      assert.ok(persisted.errorMessage?.includes('SMTP Connection Timeout'));
    });
  });

  describe('5. Procesamiento por lotes y resiliencia ante fallos (dispatchPendingNotifications)', () => {
    it('debe procesar lote de notificaciones en PENDING y retornar resumen consolidado', async () => {
      const now = new Date();

      // Notificación 1: Éxito
      notificationsDb.push({
        id: 'batch-1',
        idempotencyKey: 'k-1',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'v-1',
        recipient: 'success1@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(now.getTime() - 3000),
        updatedAt: now,
      });

      // Notificación 2: Éxito
      notificationsDb.push({
        id: 'batch-2',
        idempotencyKey: 'k-2',
        type: NotificationType.VACCINE_ALERT,
        entityId: 'vac-2',
        recipient: 'success2@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(now.getTime() - 2000),
        updatedAt: now,
      });

      // Notificación 3: Ya enviada (no debe procesarse)
      notificationsDb.push({
        id: 'batch-3',
        idempotencyKey: 'k-3',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'v-3',
        recipient: 'already@example.com',
        targetDate: now,
        status: NotificationStatus.SENT,
        retryCount: 0,
        errorMessage: null,
        sentAt: now,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now,
      });

      const summary: DispatchBatchSummary = await dispatcherService.dispatchPendingNotifications(50);

      assert.strictEqual(summary.processed, 2);
      assert.strictEqual(summary.sent, 2);
      assert.strictEqual(summary.retried, 0);
      assert.strictEqual(summary.failed, 0);
    });

    it('resiliencia: un fallo individual no debe cancelar ni interrumpir las demás notificaciones del lote', async () => {
      const now = new Date();

      // Notificación 1: Exitoso
      notificationsDb.push({
        id: 'res-1',
        idempotencyKey: 'res-k1',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'v-1',
        recipient: 'ok1@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(now.getTime() - 3000),
        updatedAt: now,
      });

      // Notificación 2: Fallará (primer fallo -> retried)
      notificationsDb.push({
        id: 'res-2',
        idempotencyKey: 'res-k2',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'v-2',
        recipient: 'fail@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(now.getTime() - 2000),
        updatedAt: now,
      });

      // Notificación 3: Fallará por 3a vez -> failed definitivo
      notificationsDb.push({
        id: 'res-3',
        idempotencyKey: 'res-k3',
        type: NotificationType.VISIT_REMINDER,
        entityId: 'v-3',
        recipient: 'fatal@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 2,
        errorMessage: null,
        sentAt: null,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now,
      });

      // Notificación 4: Exitoso
      notificationsDb.push({
        id: 'res-4',
        idempotencyKey: 'res-k4',
        type: NotificationType.VACCINE_ALERT,
        entityId: 'vac-4',
        recipient: 'ok2@example.com',
        targetDate: now,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        errorMessage: null,
        sentAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Simular que para el recipient fail@example.com y fatal@example.com el envío falla
      const originalSend = mailTransportService.send.bind(mailTransportService);
      mailTransportService.send = (recipient: string, subject: string, content: string) => {
        if (recipient.includes('fail') || recipient.includes('fatal')) {
          return Promise.resolve(false);
        }
        return originalSend(recipient, subject, content);
      };

      const summary = await dispatcherService.dispatchPendingNotifications(10);

      assert.strictEqual(summary.processed, 4);
      assert.strictEqual(summary.sent, 2, '2 notificaciones enviadas exitosamente');
      assert.strictEqual(summary.retried, 1, '1 notificación programada para reintento');
      assert.strictEqual(summary.failed, 1, '1 notificación fallida definitiva');

      // Verificar estados individuales
      assert.strictEqual(notificationsDb[0].status, NotificationStatus.SENT);
      assert.strictEqual(notificationsDb[1].status, NotificationStatus.PENDING);
      assert.strictEqual(notificationsDb[1].retryCount, 1);
      assert.strictEqual(notificationsDb[2].status, NotificationStatus.FAILED);
      assert.strictEqual(notificationsDb[2].retryCount, 3);
      assert.strictEqual(notificationsDb[3].status, NotificationStatus.SENT);
    });

    it('debe respetar el límite de notificaciones por lote (limit)', async () => {
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        notificationsDb.push({
          id: `lim-${i}`,
          idempotencyKey: `k-lim-${i}`,
          type: NotificationType.VISIT_REMINDER,
          entityId: `v-${i}`,
          recipient: `rec${i}@example.com`,
          targetDate: now,
          status: NotificationStatus.PENDING,
          retryCount: 0,
          errorMessage: null,
          sentAt: null,
          createdAt: new Date(now.getTime() + i * 100),
          updatedAt: now,
        });
      }

      const summary = await dispatcherService.dispatchPendingNotifications(5);
      assert.strictEqual(summary.processed, 5);
      assert.strictEqual(summary.sent, 5);
    });
  });
});
