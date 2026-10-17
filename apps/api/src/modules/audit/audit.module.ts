import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessLogsController } from './access-logs.controller';
import { AccessLogsService } from './access-logs.service';

/**
 * Módulo de auditoría e inmutabilidad de trazas de acceso (RF-25, RF-37, RNF-7).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccessLogsController],
  providers: [AccessLogsService],
  exports: [AccessLogsService],
})
export class AuditModule {}
