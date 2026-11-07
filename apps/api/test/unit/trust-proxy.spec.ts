import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as request from 'supertest';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard';

describe('Trust Proxy & Rate Limiting IP Tracking (Render Reverse Proxy)', () => {
  it('cuando TRUST_PROXY=true está configurado en Express, req.ip extrae la IP real de X-Forwarded-For', async () => {
    const adapter = new ExpressAdapter();
    const app = adapter.getInstance();
    app.set('trust proxy', true);

    let recordedIp: string | undefined;
    app.get('/test-ip', (req: any, res: any) => {
      recordedIp = req.ip;
      res.json({ ip: req.ip });
    });

    const clientRealIp = '203.0.113.195';
    const proxyHopIp = '10.0.0.1';

    await request(app)
      .get('/test-ip')
      .set('X-Forwarded-For', `${clientRealIp}, ${proxyHopIp}`)
      .expect(200);

    assert.strictEqual(
      recordedIp,
      clientRealIp,
      'Express con trust proxy debe reportar la IP del cliente final (primer salto de X-Forwarded-For)',
    );
  });

  it('cuando trust proxy es false, req.ip ignora X-Forwarded-For', async () => {
    const adapter = new ExpressAdapter();
    const app = adapter.getInstance();
    app.set('trust proxy', false);

    let recordedIp: string | undefined;
    app.get('/test-ip', (req: any, res: any) => {
      recordedIp = req.ip;
      res.json({ ip: req.ip });
    });

    const spoofedIp = '198.51.100.42';

    await request(app)
      .get('/test-ip')
      .set('X-Forwarded-For', spoofedIp)
      .expect(200);

    assert.notStrictEqual(
      recordedIp,
      spoofedIp,
      'Express sin trust proxy no debe confiar en X-Forwarded-For',
    );
  });

  it('UserThrottlerGuard debe resolver la IP del cliente utilizando getTracker', async () => {
    class TestUserThrottlerGuard extends UserThrottlerGuard {
      public testGetTracker(req: any) {
        return this.getTracker(req);
      }
    }

    const guard = new TestUserThrottlerGuard({} as any, {} as any, {} as any);

    const clientIp = '192.0.2.123';
    const mockReq = {
      user: null,
      headers: {},
      ip: clientIp,
      ips: [clientIp],
    };

    const tracker = await guard.testGetTracker(mockReq);
    assert.strictEqual(tracker, clientIp, 'Cuando no hay usuario autenticado, el tracker es req.ip');
  });

  it('con TRUST_PROXY=1 una cabecera X-Forwarded-For falsificada por el cliente NO cambia la IP que usa el rate limit', async () => {
    class TestUserThrottlerGuard extends UserThrottlerGuard {
      public testGetTracker(req: any) {
        return this.getTracker(req);
      }
    }
    const guard = new TestUserThrottlerGuard({} as any, {} as any, {} as any);

    const adapter = new ExpressAdapter();
    const app = adapter.getInstance();
    // Configuramos exactamente 1 salto de proxy reverso (Render)
    app.set('trust proxy', 1);

    let recordedReq: any;
    let rateLimitTracker: string | undefined;

    app.get('/test-rate-limit-ip', async (req: any, res: any) => {
      recordedReq = req;
      rateLimitTracker = await guard.testGetTracker(req);
      res.json({ ip: req.ip, tracker: rateLimitTracker });
    });

    const realClientIp = '198.51.100.25';
    const spoofedIp1 = '203.0.113.99';
    const spoofedIp2 = '10.0.0.88';

    // Petición 1: El cliente envía spoofedIp1; el proxy reverso añade la IP real al final de X-Forwarded-For
    await request(app)
      .get('/test-rate-limit-ip')
      .set('X-Forwarded-For', `${spoofedIp1}, ${realClientIp}`)
      .expect(200);

    assert.strictEqual(
      recordedReq.ip,
      realClientIp,
      'Con trust proxy = 1, Express debe tomar el primer salto antes del proxy (realClientIp) e ignorar la IP falsificada',
    );
    assert.strictEqual(
      rateLimitTracker,
      realClientIp,
      'El tracker de rate limit debe ser la IP real del cliente y no la IP falsificada',
    );

    // Petición 2: El cliente cambia la IP falsificada para evadir el rate limit
    await request(app)
      .get('/test-rate-limit-ip')
      .set('X-Forwarded-For', `${spoofedIp2}, ${realClientIp}`)
      .expect(200);

    assert.strictEqual(
      recordedReq.ip,
      realClientIp,
      'A pesar de cambiar la IP falsificada a la izquierda, req.ip sigue siendo la IP real',
    );
    assert.strictEqual(
      rateLimitTracker,
      realClientIp,
      'El tracker de rate limit permanece idéntico (realClientIp), impidiendo eludir el throttling',
    );
  });
});
