import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  SEED_PASSWORDS,
  request,
  TAG_1_PUBLIC_CODE,
  TAG_1_UID,
} from './e2e-helper';

describe('E2E: Rate Limiting en POST /auth/login y Auditoría de Endpoints Sensibles', () => {
  let app: INestApplication;
  let adminToken: string;

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;

    // Obtener un token de administrador para las pruebas de endpoints autenticados
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-forwarded-for', '198.51.100.1')
      .send({
        email: 'admin@vetapp.com',
        password: SEED_PASSWORDS.admin,
      });
    adminToken = loginRes.body.accessToken;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. POST /auth/login - Rate Limiting por IP', () => {
    it('debe limitar a 10 intentos por minuto por IP y devolver HTTP 429 con Retry-After en el intento 11', async () => {
      const testIp = '198.51.100.77';

      // Enviamos 10 intentos con contraseña incorrecta desde testIp
      for (let i = 1; i <= 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', testIp)
          .send({
            email: 'admin@vetapp.com',
            password: 'WrongPassword123!',
          });

        assert.strictEqual(
          res.status,
          401,
          `El intento ${i} debe retornar 401 Unauthorized ante credenciales erróneas`,
        );
      }

      // El intento 11 DEBE ser bloqueado con HTTP 429 Too Many Requests
      const res11 = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-forwarded-for', testIp)
        .send({
          email: 'admin@vetapp.com',
          password: 'WrongPassword123!',
        });

      assert.strictEqual(
        res11.status,
        429,
        `El intento 11 debe retornar HTTP 429 Too Many Requests (obtenido: ${res11.status})`,
      );

      // Debe incluir cabecera Retry-After
      const retryAfter = res11.headers['retry-after'];
      assert.ok(retryAfter, 'La respuesta 429 debe incluir la cabecera Retry-After');
      assert.ok(Number(retryAfter) > 0, 'Retry-After debe ser un número positivo de segundos');

      // Debe tener mensaje de error en español
      const responseBody = res11.body;
      const message =
        typeof responseBody.message === 'string'
          ? responseBody.message
          : JSON.stringify(responseBody);
      assert.match(
        message,
        /(demasiad|intento|espere|segundo)/i,
        'El mensaje de error debe estar en español indicando exceso de intentos',
      );
    });

    it('no debe bloquear por correo a una víctima: otra IP puede seguir autenticándose con la misma cuenta', async () => {
      const attackerIp = '198.51.100.88';
      const legitimateIp = '198.51.100.99';

      // El atacante agota los 10 intentos con contraseña incorrecta
      for (let i = 1; i <= 10; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', attackerIp)
          .send({
            email: 'admin@vetapp.com',
            password: 'AttackerGuessPassword!',
          });
      }

      // El atacante queda bloqueado con 429
      const attackerBlocked = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-forwarded-for', attackerIp)
        .send({
          email: 'admin@vetapp.com',
          password: 'AttackerGuessPassword!',
        });
      assert.strictEqual(attackerBlocked.status, 429, 'El atacante debe estar bloqueado');

      // El usuario legítimo desde otra IP puede iniciar sesión normalmente con sus credenciales correctas
      const legitimateLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-forwarded-for', legitimateIp)
        .send({
          email: 'admin@vetapp.com',
          password: SEED_PASSWORDS.admin,
        });

      assert.strictEqual(
        legitimateLogin.status,
        200,
        'La víctima desde otra IP no debe sufrir bloqueo de cuenta (previene ataque de DoS por correo)',
      );
      assert.ok(legitimateLogin.body.accessToken, 'El usuario legítimo debe recibir su token');
    });

    it('con trust proxy = 1, cabeceras X-Forwarded-For falsificadas a la izquierda no evaden el límite y acumulan en la IP real', async () => {
      const realClientIp = '198.51.100.200';

      // El cliente envía 10 peticiones variando la IP falsificada a la izquierda,
      // pero el proxy reverso añade la IP real al final de X-Forwarded-For
      for (let i = 1; i <= 10; i++) {
        const spoofedIp = `10.200.${i}.1`;
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', `${spoofedIp}, ${realClientIp}`)
          .send({
            email: 'admin@vetapp.com',
            password: 'WrongPassword!',
          });

        assert.strictEqual(res.status, 401);
      }

      // La petición 11 con otra IP falsa a la izquierda debe ser bloqueada porque la IP real acumuló 10 intentos
      const res11 = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-forwarded-for', `203.0.113.99, ${realClientIp}`)
        .send({
          email: 'admin@vetapp.com',
          password: 'WrongPassword!',
        });

      assert.strictEqual(
        res11.status,
        429,
        'La petición 11 debe responder 429 a pesar de falsificar la IP a la izquierda',
      );
    });

    it('debe respetar variables de entorno LOGIN_THROTTLE_LIMIT y LOGIN_THROTTLE_TTL_MS de forma dinámica', async () => {
      const customIp = '198.51.100.210';
      const originalLimit = process.env.LOGIN_THROTTLE_LIMIT;

      try {
        // Reducimos temporalmente el límite a 2 intentos
        process.env.LOGIN_THROTTLE_LIMIT = '2';

        // Intento 1
        const res1 = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', customIp)
          .send({ email: 'admin@vetapp.com', password: 'WrongPassword123!' });
        assert.strictEqual(res1.status, 401);

        // Intento 2
        const res2 = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', customIp)
          .send({ email: 'admin@vetapp.com', password: 'WrongPassword123!' });
        assert.strictEqual(res2.status, 401);

        // Intento 3 debe retornar 429 bajo el límite de 2
        const res3 = await request(app.getHttpServer())
          .post('/auth/login')
          .set('x-forwarded-for', customIp)
          .send({ email: 'admin@vetapp.com', password: 'WrongPassword123!' });
        assert.strictEqual(res3.status, 429, 'El intento 3 debe ser bloqueado con LOGIN_THROTTLE_LIMIT=2');
      } finally {
        if (originalLimit !== undefined) {
          process.env.LOGIN_THROTTLE_LIMIT = originalLimit;
        } else {
          delete process.env.LOGIN_THROTTLE_LIMIT;
        }
      }
    });
  });

  describe('2. Auditoría de Endpoints Sensibles y Públicos', () => {
    it('auditoría: GET /p/:publicCode aplica rate limiting estricto (10 req/min)', async () => {
      const rescueIp = '198.51.100.220';
      let throttled = false;

      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer())
          .get(`/p/${TAG_1_PUBLIC_CODE}`)
          .set('x-forwarded-for', rescueIp);

        if (res.status === 429) {
          throttled = true;
          assert.ok(res.headers['retry-after'], 'Debe incluir Retry-After');
          break;
        }
      }

      assert.strictEqual(throttled, true, 'GET /p/:publicCode debe aplicar rate limit y devolver 429');
    });

    it('auditoría: POST /owners/lookup aplica rate limiting estricto (10 req/min)', async () => {
      const lookupIp = '198.51.100.230';
      let throttled = false;

      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer())
          .post('/owners/lookup')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-forwarded-for', lookupIp)
          .send({ documentId: 'DOC123456' });

        if (res.status === 429) {
          throttled = true;
          assert.ok(res.headers['retry-after'], 'Debe incluir Retry-After');
          break;
        }
      }

      assert.strictEqual(throttled, true, 'POST /owners/lookup debe aplicar rate limit y devolver 429');
    });

    it('auditoría: GET /tags/resolve/:uid aplica rate limiting granular en TagAbuseProtectionService (30 req/min)', async () => {
      let throttled = false;

      // Enviamos hasta 35 peticiones para superar el límite por defecto de 30 escaneos por usuario
      for (let i = 0; i < 35; i++) {
        const res = await request(app.getHttpServer())
          .get(`/tags/resolve/${TAG_1_UID}`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (res.status === 429) {
          throttled = true;
          assert.match(
            res.body.message,
            /(límite|escaneos|excedido|demasiados)/i,
            'El mensaje de 429 debe explicar el bloqueo de escaneos en español',
          );
          break;
        }
      }

      assert.strictEqual(
        throttled,
        true,
        'GET /tags/resolve/:uid debe aplicar rate limit granular por usuario y devolver 429 tras 30 escaneos',
      );
    });
  });
});
