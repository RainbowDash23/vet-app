import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationsService,
  QueueNotificationInput,
} from './notifications.service';

export interface SchedulerExecutionSummary {
  visitReminders: number;
  vaccineAlerts: number;
  total: number;
}

/**
 * Planificador programado de recordatorios de citas y alertas sanitarias de revacunación
 * a 72 horas con clave de idempotencia (RF-51, RF-52, RF-53).
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  // Ventana de tolerancia horaria en torno a la marca exacta de 72 horas (+/- 1 hora)
  private readonly WINDOW_HOURS = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Delega la generación de la clave compuesta de idempotencia (RF-53).
   */
  generateIdempotencyKey(
    type: NotificationType,
    entityId: string,
    targetDate: Date,
  ): string {
    return this.notificationsService.generateIdempotencyKey(
      type,
      entityId,
      targetDate,
    );
  }

  /**
   * Delega el encolado idempotente con descarte silencioso (RF-53).
   */
  async queueNotification(
    data: QueueNotificationInput,
  ): Promise<Notification | null> {
    return this.notificationsService.queueNotification(data);
  }

  /**
   * Identifica citas en estado SCHEDULED cuya fecha programada ocurra con 72 horas
   * de antelación y encola un recordatorio dirigido al dueño (RF-51).
   *
   * @param referenceDate Fecha base de evaluación (por defecto la fecha y hora actual).
   * @returns Cantidad de recordatorios encolados satisfactoriamente.
   */
  async scheduleVisitReminders(referenceDate = new Date()): Promise<number> {
    const targetCenter = new Date(
      referenceDate.getTime() + 72 * 60 * 60 * 1000,
    );
    const windowStart = new Date(
      targetCenter.getTime() - this.WINDOW_HOURS * 60 * 60 * 1000,
    );
    const windowEnd = new Date(
      targetCenter.getTime() + this.WINDOW_HOURS * 60 * 60 * 1000,
    );

    const visits = await this.prisma.visit.findMany({
      where: {
        status: VisitStatus.SCHEDULED,
        deletedAt: null,
        scheduledDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        pet: {
          include: {
            owner: true,
          },
        },
      },
    });

    let queuedCount = 0;

    for (const visit of visits) {
      const owner = visit.pet?.owner;
      if (!owner || owner.deletedAt) {
        continue;
      }

      // Priorizar correo electrónico, si no existe o está vacío usar teléfono
      const recipient = (owner.email?.trim() || owner.phone?.trim()) ?? '';
      if (!recipient) {
        continue;
      }

      const created = await this.notificationsService.queueNotification({
        type: NotificationType.VISIT_REMINDER,
        entityId: visit.id,
        recipient,
        targetDate: visit.scheduledDate,
      });

      if (created) {
        queuedCount++;
      }
    }

    this.logger.log(
      `Planificador de visitas procesado: ${queuedCount} recordatorios encolados para el horizonte 72h`,
    );

    return queuedCount;
  }

  /**
   * Identifica vacunaciones activas cuya fecha de próximo refuerzo ocurra en el
   * horizonte de 72 horas naturales y encola una alerta sanitaria dirigida al dueño (RF-52).
   *
   * @param referenceDate Fecha base de evaluación (por defecto la fecha y hora actual).
   * @returns Cantidad de alertas de revacunación encoladas satisfactoriamente.
   */
  async scheduleVaccineAlerts(referenceDate = new Date()): Promise<number> {
    const targetCenter = new Date(
      referenceDate.getTime() + 72 * 60 * 60 * 1000,
    );
    const windowStart = new Date(
      targetCenter.getTime() - this.WINDOW_HOURS * 60 * 60 * 1000,
    );
    const windowEnd = new Date(
      targetCenter.getTime() + this.WINDOW_HOURS * 60 * 60 * 1000,
    );

    const vaccinations = await this.prisma.vaccination.findMany({
      where: {
        deletedAt: null,
        nextDueDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        pet: {
          include: {
            owner: true,
          },
        },
      },
    });

    let queuedCount = 0;

    for (const vaccination of vaccinations) {
      if (!vaccination.nextDueDate) {
        continue;
      }

      const owner = vaccination.pet?.owner;
      if (!owner || owner.deletedAt) {
        continue;
      }

      const recipient = (owner.email?.trim() || owner.phone?.trim()) ?? '';
      if (!recipient) {
        continue;
      }

      const created = await this.notificationsService.queueNotification({
        type: NotificationType.VACCINE_ALERT,
        entityId: vaccination.id,
        recipient,
        targetDate: vaccination.nextDueDate,
      });

      if (created) {
        queuedCount++;
      }
    }

    this.logger.log(
      `Planificador de vacunas procesado: ${queuedCount} alertas encoladas para el horizonte 72h`,
    );

    return queuedCount;
  }

  /**
   * Ejecuta de forma consolidada la detección y encolado de recordatorios de citas
   * y alertas de revacunación (RF-51, RF-52).
   *
   * @param referenceDate Fecha base de evaluación.
   * @returns Resumen con las cantidades encoladas por tipo y total general.
   */
  async runScheduler(
    referenceDate = new Date(),
  ): Promise<SchedulerExecutionSummary> {
    const visitReminders = await this.scheduleVisitReminders(referenceDate);
    const vaccineAlerts = await this.scheduleVaccineAlerts(referenceDate);

    return {
      visitReminders,
      vaccineAlerts,
      total: visitReminders + vaccineAlerts,
    };
  }
}
