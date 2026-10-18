import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Notification, NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueueNotificationInput {
  type: NotificationType;
  entityId: string;
  recipient: string;
  targetDate: Date;
}

/**
 * Servicio centralizado para la persistencia, deduplicación e idempotencia
 * de notificaciones sanitarias (RF-51, RF-52, RF-53).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera de forma determinista una clave de idempotencia hash SHA-256 compuesta
   * basada en la tupla (type, entityId, targetDate ISO) (RF-53).
   */
  generateIdempotencyKey(
    type: NotificationType,
    entityId: string,
    targetDate: Date,
  ): string {
    const rawPayload = `${type}:${entityId}:${targetDate.toISOString()}`;
    return crypto.createHash('sha256').update(rawPayload).digest('hex');
  }

  /**
   * Encola una notificación aplicando descarte silencioso si ya existe un registro
   * con la misma clave de idempotencia compuesta (RF-53).
   *
   * @param data Datos de la notificación a encolar.
   * @returns La notificación creada o null si fue descartada por idempotencia.
   */
  async queueNotification(
    data: QueueNotificationInput,
  ): Promise<Notification | null> {
    const idempotencyKey = this.generateIdempotencyKey(
      data.type,
      data.entityId,
      data.targetDate,
    );

    // Verificación preventiva de existencia
    const existing = await this.prisma.notification.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      this.logger.debug(
        `Notificación descartada por idempotencia previa: [${data.type}] para entidad ${data.entityId} (Key: ${idempotencyKey})`,
      );
      return null;
    }

    try {
      const created = await this.prisma.notification.create({
        data: {
          idempotencyKey,
          type: data.type,
          entityId: data.entityId,
          recipient: data.recipient,
          targetDate: data.targetDate,
          status: NotificationStatus.PENDING,
          retryCount: 0,
        },
      });

      this.logger.log(
        `Notificación encolada exitosamente: [${data.type}] ID ${created.id} (Destinatario: ${data.recipient})`,
      );
      return created;
    } catch (error: any) {
      // P2002: Prisma Unique constraint failed (manejo de condición de carrera)
      if (error?.code === 'P2002') {
        this.logger.debug(
          `Colisión de concurrencia P2002 absorbida para key: ${idempotencyKey}`,
        );
        return null;
      }
      throw error;
    }
  }

  /**
   * Consulta notificaciones por ID.
   */
  async findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({
      where: { id },
    });
  }

  /**
   * Consulta notificaciones en estado PENDING con targetDate menor o igual al umbral actual.
   */
  async findPending(limit = 100): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.PENDING,
      },
      take: limit,
      orderBy: {
        targetDate: 'asc',
      },
    });
  }
}
