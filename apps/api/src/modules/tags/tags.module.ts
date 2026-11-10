import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PetsModule } from '../pets/pets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { TagAbuseProtectionService } from './tag-abuse-protection.service';

/**
 * Módulo del subsistema de tags NFC e identificación médica (RF-28 a RF-32, RF-56).
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    PetsModule,
    NotificationsModule,
  ],
  controllers: [TagsController],
  providers: [TagsService, TagAbuseProtectionService],
  exports: [TagsService, TagAbuseProtectionService],
})
export class TagsModule {}
