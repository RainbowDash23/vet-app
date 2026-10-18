import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmergencyController } from './emergency.controller';
import { EmergencyService } from './emergency.service';

/**
 * Módulo de portal público de contingencia y rescate de mascotas (RF-35 a RF-38).
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmergencyController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
