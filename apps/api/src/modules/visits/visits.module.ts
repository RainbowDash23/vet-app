import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PetsModule } from '../pets/pets.module';
import { CollisionValidator } from './collision.validator';
import { VitalsValidator } from './vitals.validator';
import { VisitNotesService } from './visit-notes.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/**
 * Módulo para la gestión unificada de visitas clínicas, notas evolutivas y agenda médica (RF-39 a RF-47).
 */
@Module({
  imports: [PrismaModule, AuthModule, PetsModule],
  controllers: [VisitsController],
  providers: [
    VisitsService,
    VisitNotesService,
    CollisionValidator,
    VitalsValidator,
  ],
  exports: [
    VisitsService,
    VisitNotesService,
    CollisionValidator,
    VitalsValidator,
  ],
})
export class VisitsModule {}
