import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerLimitDetail, ThrottlerStorage } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard';

describe('UserThrottlerGuard: Rate limiting por usuario autenticado con JWT verificado', () => {
  const secret = 'test-jwt-secret-key-32-chars-long!!';
  const originalSecret = process.env.JWT_SECRET;
  const jwt = new JwtService();

  before(() => {
    process.env.JWT_SECRET = secret;
  });

  after(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const dummyStorage: ThrottlerStorage = {
    increment: async () => ({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };

  // Creamos una subclase para exponer los métodos protegidos en tests unitarios
  class TestUserThrottlerGuard extends UserThrottlerGuard {
    public testGetTracker(req: Record<string, unknown>) {
      return this.getTracker(req);
    }

    public testThrowException(context: ExecutionContext, detail: ThrottlerLimitDetail) {
      return this.throwThrottlingException(context, detail);
    }
  }

  const guard = new TestUserThrottlerGuard(
    { throttlers: [{ limit: 10, ttl: 60000 }] },
    dummyStorage,
    new Reflector(),
  );

  it('debe retornar user-<userId> si req.user ya está presente y autenticado', async () => {
    const req = {
      user: { userId: 'user-123' },
      ip: '192.168.1.50',
    };
    const tracker = await guard.testGetTracker(req);
    assert.strictEqual(tracker, 'user-user-123');
  });

  it('debe retornar user-<sub/userId> a partir de un JWT con firma criptográfica válida', async () => {
    const token = jwt.sign({ sub: 'user-verified-456' }, { secret, expiresIn: '15m' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
      ip: '192.168.1.50',
    };
    const tracker = await guard.testGetTracker(req);
    assert.strictEqual(tracker, 'user-user-verified-456');
  });

  it('debe rechazar token con firma forjada/inválida y respaldar por IP', async () => {
    // Firmado con una clave secreta incorrecta (forjado)
    const forgedToken = jwt.sign({ sub: 'user-hacker' }, { secret: 'wrong-fake-secret', expiresIn: '15m' });
    const req = {
      headers: { authorization: `Bearer ${forgedToken}` },
      ip: '192.168.1.99',
    };
    const tracker = await guard.testGetTracker(req);
    // Debe haber caído en el fallback de IP y NO haber usado user-user-hacker
    assert.strictEqual(tracker, '192.168.1.99');
  });

  it('debe rechazar token expirado y respaldar por IP', async () => {
    // Token ya expirado
    const expiredToken = jwt.sign({ sub: 'user-expired' }, { secret, expiresIn: '-1s' });
    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
      ip: '192.168.1.77',
    };
    const tracker = await guard.testGetTracker(req);
    assert.strictEqual(tracker, '192.168.1.77');
  });

  it('debe respaldar por IP si no se envía cabecera Authorization ni req.user', async () => {
    const req = {
      headers: {},
      ip: '10.0.0.1',
    };
    const tracker = await guard.testGetTracker(req);
    assert.strictEqual(tracker, '10.0.0.1');
  });

  it('throwThrottlingException debe incluir cabecera Retry-After y mensaje en español según el endpoint', async () => {
    let capturedHeaderName = '';
    let capturedHeaderVal: string | number = 0;

    const mockResponse = {
      header: (name: string, value: string | number) => {
        capturedHeaderName = name;
        capturedHeaderVal = value;
      },
    };

    const mockLoginContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => mockResponse,
      }),
      getHandler: () => ({ name: 'login' }),
      getClass: () => ({ name: 'AuthController' }),
    } as unknown as ExecutionContext;

    const detail: ThrottlerLimitDetail = {
      limit: 10,
      ttl: 60000,
      key: 'key-1',
      tracker: '198.51.100.1',
      totalHits: 11,
      timeToExpire: 45,
      isBlocked: true,
      timeToBlockExpire: 45,
    };

    await assert.rejects(
      async () => {
        await guard.testThrowException(mockLoginContext, detail);
      },
      (err: Error) => {
        assert.match(err.message, /demasiados intentos de inicio de sesión/i);
        assert.match(err.message, /45 segundos/);
        return true;
      },
    );

    assert.strictEqual(capturedHeaderName, 'Retry-After');
    assert.strictEqual(capturedHeaderVal, 45);
  });
});
