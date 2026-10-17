import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { AccessGrantsService } from './access-grants.service';

/**
 * Módulo de gestión para el padrón centralizado de mascotas (RF-17 a RF-20)
 * y consentimientos temporales de acceso médico multi-clínica (RF-21 a RF-24).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PetsController],
  providers: [PetsService, AccessGrantsService],
  exports: [PetsService, AccessGrantsService],
})
export class PetsModule {}
