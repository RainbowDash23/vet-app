import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PetsModule } from '../pets/pets.module';
import { VaccinationsController } from './vaccinations.controller';
import { VaccinationsService } from './vaccinations.service';

/**
 * Módulo de vacunaciones y registro de refuerzos sanitarios (RF-48, RF-21, RNF-8).
 */
@Module({
  imports: [PrismaModule, AuthModule, PetsModule],
  controllers: [VaccinationsController],
  providers: [VaccinationsService],
  exports: [VaccinationsService],
})
export class VaccinationsModule {}
