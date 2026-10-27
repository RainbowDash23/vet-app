import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

describe('Trust Proxy & Rate Limiting IP Tracking (Render Reverse Proxy)', () => {
  it('cuando TRUST_PROXY=true está configurado en Express, req.ip extrae la IP real de X-Forwarded-For', async () => {
    const app = express();
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
    const app = express();
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
      'Express sin trust proxy no debe aceptar X-Forwarded-For arbitrario',
    );
  });

  it('UserThrottlerGuard rastrea por la IP real del cliente obtenida a través de trust proxy', async () => {
    class TestThrottlerGuard extends UserThrottlerGuard {
      public async testGetTracker(req: Record<string, any>): Promise<string> {
        return this.getTracker(req);
      }
    }

    const options = [{ ttl: 60000, limit: 100 }];
    const storageService = {
      increment: async () => ({ totalHits: 1, timeToExpire: 60000, isBlocked: false, timeToBlockExpire: 0 }),
    };
    const reflector = {
      get: () => false,
      getAllAndOverride: () => false,
    };

    const guard = new TestThrottlerGuard(options as any, storageService as any, reflector as any);

    const clientRealIp = '198.51.100.99';
    const mockReq = {
      headers: {},
      ip: clientRealIp,
      ips: [clientRealIp, '10.0.0.2'],
    };

    const tracker = await guard.testGetTracker(mockReq);
    assert.strictEqual(
      tracker,
      clientRealIp,
      'El tracker de limitación de tasa debe utilizar la IP del cliente real',
    );
  });
});
