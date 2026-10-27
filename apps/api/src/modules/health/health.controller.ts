import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  timestamp: string;
  uptime: number;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe:
   * Público, excluido del rate limiting (@SkipThrottle).
   * NO consulta la base de datos para no mantener Neon despierto.
   */
  @Get()
  @SkipThrottle()
  check(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness probe:
   * Público, sujeto a rate limiting.
   * Ejecuta SELECT 1 para verificar conectividad con PostgreSQL.
   */
  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }
  }
}
