import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmergencyController } from './emergency.controller';
import { PublicRescueController } from './public-rescue.controller';
import { EmergencyService } from './emergency.service';

/**
 * Módulo de portal público de contingencia y rescate de mascotas (RF-35 a RF-38, RF-64).
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmergencyController, PublicRescueController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
