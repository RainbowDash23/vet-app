import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { MailTransportService } from './mail-transport.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

/**
 * Módulo de notificaciones sanitarias programadas e idempotencia (RF-51, RF-52, RF-53, RF-54).
 */
@Module({
  imports: [PrismaModule],
  providers: [
    NotificationsService,
    NotificationSchedulerService,
    MailTransportService,
    NotificationDispatcherService,
  ],
  exports: [
    NotificationsService,
    NotificationSchedulerService,
    MailTransportService,
    NotificationDispatcherService,
  ],
})
export class NotificationsModule {}

