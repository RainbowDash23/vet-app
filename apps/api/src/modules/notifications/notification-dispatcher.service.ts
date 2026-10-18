import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailTransportService } from './mail-transport.service';

/**
 * Constantes de retroceso exponencial para reintentos de notificación (RF-54).
 * 1 minuto (60.000 ms), 5 minutos (300.000 ms), 15 minutos (900.000 ms).
 */
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];
export const MAX_RETRIES = 3;

export interface NotificationDispatchResult {
  success: boolean;
  status: NotificationStatus;
  retryCount: number;
}

export interface DispatchBatchSummary {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
}

/**
 * Despachador asíncrono de notificaciones sanitarias con tolerancia a fallos
 * y reintentos con retroceso exponencial (RF-54).
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  public readonly maxRetries = MAX_RETRIES;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailTransportService: MailTransportService,
  ) {}

  /**
   * Calcula el retardo en milisegundos correspondiente al número de reintento (RF-54):
   * 1 -> 60_000 ms (1 minuto)
   * 2 -> 300_000 ms (5 minutos)
   * 3 -> 900_000 ms (15 minutos)
   *
   * @param retryCount Número de reintento (1-indexado).
   * @returns Retardo de retroceso exponencial en ms.
   */
  calculateBackoffDelay(retryCount: number): number {
    if (retryCount <= 1) {
      return RETRY_DELAYS_MS[0];
    }
    if (retryCount === 2) {
      return RETRY_DELAYS_MS[1];
    }
    return RETRY_DELAYS_MS[2];
  }

  /**
   * Intenta el despacho individual de una notificación sanitaria (RF-54).
   * En caso de éxito, actualiza el estado a SENT con sentAt = now().
   * Ante fallos de transporte o excepciones, incrementa el contador de reintentos
   * y programa hasta 3 intentos antes de marcar definitivamente como FAILED.
   *
   * @param notification Registro de notificación de Prisma o payload equivalente.
   * @returns Resultado tipado con indicador de éxito, estado final y reintentos.
   */
  async dispatchNotification(
    notification: Pick<Notification, 'id' | 'type' | 'entityId' | 'recipient' | 'targetDate' | 'retryCount'> | any,
  ): Promise<NotificationDispatchResult> {
    const subject =
      notification.type === NotificationType.VISIT_REMINDER
        ? 'Recordatorio de Cita Médica Veterinaria'
        : 'Alerta Sanitaria: Próximo Refuerzo de Vacunación';

    const content =
      `Estimado/a propietario/a, le recordamos su compromiso sanitario para la fecha ` +
      `${new Date(notification.targetDate).toLocaleString()}.\nReferencia de entidad: ${notification.entityId}`;

    try {
      const isSent = await this.mailTransportService.send(
        notification.recipient,
        subject,
        content,
      );

      if (isSent) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            errorMessage: null,
          },
        });

        this.logger.log(
          `Notificación ${notification.id} enviada exitosamente a ${notification.recipient}`,
        );

        return {
          success: true,
          status: NotificationStatus.SENT,
          retryCount: notification.retryCount ?? 0,
        };
      }

      // Si el transporte retornó false sin arrojar excepción
      return await this.handleDispatchError(
        notification,
        new Error(`Fallo en el transporte de correo hacia ${notification.recipient}`),
      );
    } catch (error: any) {
      return await this.handleDispatchError(notification, error);
    }
  }

  /**
   * Gestiona el registro de error y la política de reintentos con retroceso exponencial (RF-54).
   */
  private async handleDispatchError(
    notification: any,
    error: any,
  ): Promise<NotificationDispatchResult> {
    const currentRetry = notification.retryCount ?? 0;
    const newRetryCount = currentRetry + 1;
    const errorMessage = error?.message || 'Error desconocido en el transporte';

    if (newRetryCount >= MAX_RETRIES) {
      // Agotados todos los reintentos: marcación definitiva como FAILED (RF-54)
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          retryCount: newRetryCount,
          errorMessage,
        },
      });

      this.logger.error(
        `Notificación ${notification.id} marcada como FAILED definitiva tras agotar ${newRetryCount} intentos. Error: ${errorMessage}`,
      );

      return {
        success: false,
        status: NotificationStatus.FAILED,
        retryCount: newRetryCount,
      };
    }

    // Aún quedan reintentos disponibles: calcular retardo exponencial y mantener estado PENDING (RF-54)
    const backoffDelay = this.calculateBackoffDelay(newRetryCount);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.PENDING,
        retryCount: newRetryCount,
        errorMessage,
      },
    });

    this.logger.warn(
      `Notificación ${notification.id} falló (intento ${newRetryCount}/${MAX_RETRIES}). Reintento programado con retardo de ${backoffDelay} ms (${backoffDelay / 60000} min). Error: ${errorMessage}`,
    );

    return {
      success: false,
      status: NotificationStatus.PENDING,
      retryCount: newRetryCount,
    };
  }

  /**
   * Consulta y procesa un lote de notificaciones en estado PENDING ordenadas cronológicamente
   * con tolerancia a fallos por elemento (RF-54).
   *
   * @param limit Límite máximo de elementos a procesar en la tanda (por defecto 50).
   * @returns Resumen consolidado del procesamiento del lote.
   */
  async dispatchPendingNotifications(limit = 50): Promise<DispatchBatchSummary> {
    const pendingNotifications = await this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.PENDING,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    const summary: DispatchBatchSummary = {
      processed: pendingNotifications.length,
      sent: 0,
      retried: 0,
      failed: 0,
    };

    for (const notification of pendingNotifications) {
      try {
        const result = await this.dispatchNotification(notification);
        if (result.success) {
          summary.sent++;
        } else if (result.status === NotificationStatus.FAILED) {
          summary.failed++;
        } else {
          summary.retried++;
        }
      } catch (error: any) {
        this.logger.error(
          `Excepción no interceptada al despachar notificación ${notification.id}: ${error?.message}`,
        );
        summary.failed++;
      }
    }

    this.logger.log(
      `Lote de despacho finalizado: ${summary.processed} procesadas | ${summary.sent} enviadas | ${summary.retried} reintentadas | ${summary.failed} fallidas`,
    );

    return summary;
  }
}
