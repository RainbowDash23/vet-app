import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../src/modules/health/health.controller';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('HealthController (Liveness & Readiness Probes)', () => {
  it('GET /health (liveness): debe retornar status ok y uptime sin tocar la base de datos', () => {
    let dbCalled = false;
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        dbCalled = true;
      },
    } as unknown as PrismaService;

    const controller = new HealthController(mockPrisma);
    const result = controller.check();

    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(typeof result.timestamp, 'string');
    assert.strictEqual(typeof result.uptime, 'number');
    assert.strictEqual(dbCalled, false, 'Liveness nunca debe consultar la base de datos');
  });

  it('GET /health (liveness): debe tener el decorador @SkipThrottle() para evitar rate limit en Render', () => {
    const keys = Reflect.getMetadataKeys(HealthController.prototype.check);
    const hasSkipThrottle = keys.some((k: string) => String(k).startsWith('THROTTLER:SKIP'));
    assert.strictEqual(hasSkipThrottle, true, 'check() debe tener metadata THROTTLER:SKIP');
  });

  it('GET /health/ready (readiness): debe retornar database connected cuando SELECT 1 tiene éxito', async () => {
    let queryExecuted = '';
    const mockPrisma = {
      $queryRawUnsafe: async (sql: string) => {
        queryExecuted = sql;
        return [{ '?column?': 1 }];
      },
    } as unknown as PrismaService;

    const controller = new HealthController(mockPrisma);
    const result = await controller.ready();

    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.database, 'connected');
    assert.strictEqual(queryExecuted, 'SELECT 1');
  });

  it('GET /health/ready (readiness): debe lanzar ServiceUnavailableException (503) cuando la base de datos falla', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        throw new Error('Connection refused');
      },
    } as unknown as PrismaService;

    const controller = new HealthController(mockPrisma);

    await assert.rejects(
      async () => {
        await controller.ready();
      },
      (err: unknown) => {
        assert.ok(err instanceof ServiceUnavailableException);
        const response = (err as ServiceUnavailableException).getResponse() as any;
        assert.strictEqual(response.status, 'error');
        assert.strictEqual(response.database, 'disconnected');
        return true;
      },
    );
  });

  it('GET /health/ready (readiness): no debe tener @SkipThrottle() para aplicar rate limit', () => {
    const keys = Reflect.getMetadataKeys(HealthController.prototype.ready);
    const hasSkipThrottle = keys.some((k: string) => String(k).startsWith('THROTTLER:SKIP'));
    assert.strictEqual(hasSkipThrottle, false, 'ready() no debe tener metadata THROTTLER:SKIP');
  });
});
