import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { JwtService } from '@nestjs/jwt';
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

  // Creamos una subclase para exponer el método protegido getTracker en tests unitarios
  class TestUserThrottlerGuard extends UserThrottlerGuard {
    public testGetTracker(req: any) {
      return this.getTracker(req);
    }
  }

  const guard = new TestUserThrottlerGuard({} as any, {} as any, {} as any);

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
});
