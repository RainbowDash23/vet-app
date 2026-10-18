import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PetsModule } from '../pets/pets.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/**
 * Módulo de gestión y resguardo de archivos adjuntos clínicos (RF-49, RF-50).
 */
@Module({
  imports: [PrismaModule, AuthModule, PetsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
