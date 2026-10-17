import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

/**
 * Módulo de gestión para el padrón centralizado de dueños (RF-14 a RF-16, RF-19).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
