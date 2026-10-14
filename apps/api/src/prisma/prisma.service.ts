import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Conexión con PostgreSQL establecida correctamente.');
    } catch (error) {
      this.logger.warn(
        `No fue posible conectar con PostgreSQL durante el arranque: ${(error as Error).message}. Asegúrate de levantar el contenedor con docker compose.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
