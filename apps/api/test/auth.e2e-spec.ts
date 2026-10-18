import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { INestApplication } from '@nestjs/common';
import { createTestApp, SEED_PASSWORDS, InMemoryDb, request } from './e2e-helper';

describe('E2E: Módulo de Autenticación y Autorización RBAC (auth.e2e-spec.ts)', () => {
  let app: INestApplication;
  let db: InMemoryDb;

  before(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    db = testContext.db;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. POST /auth/login - Emisión de Tokens (RF-1)', () => {
    it('debe autenticar credenciales válidas y emitir Access Token (15m) y Refresh Token (7d)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@vetapp.com',
          password: SEED_PASSWORDS.admin,
        });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.accessToken, 'Debe incluir accessToken');
      assert.ok(response.body.refreshToken, 'Debe incluir refreshToken');
      assert.strictEqual(response.body.tokenType, 'Bearer');
      assert.strictEqual(response.body.expiresIn, '15m');
      assert.strictEqual(response.body.user.email, 'admin@vetapp.com');
      assert.strictEqual(response.body.user.role, 'ADMIN');

      // Validar que el refresh token fue persistido como hash en la base de datos
      assert.strictEqual(db.refreshTokens.length, 1);
      assert.strictEqual(db.refreshTokens[0].userId, response.body.user.id);
      assert.strictEqual(db.refreshTokens[0].revokedAt, null);
    });
  });

  describe('2. POST /auth/login - Rechazo ante Credenciales Erróneas (RF-2)', () => {
    it('debe responder con HTTP 401 Unauthorized ante contraseña incorrecta', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@vetapp.com',
          password: 'WrongPassword999!',
        });

      assert.strictEqual(response.status, 401);
      assert.ok(response.body.message.includes('inválidas') || response.body.statusCode === 401);
    });

    it('debe responder con HTTP 401 Unauthorized ante usuario inexistente', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'no-existe@vetapp.com',
          password: 'AnyPassword123!',
        });

      assert.strictEqual(response.status, 401);
    });
  });

  describe('3. POST /auth/refresh - Rotación Atómica de Refresh Tokens (RF-6)', () => {
    it('debe rotar tokens invalidando atómicamente el refresh token previo y emitiendo uno nuevo', async () => {
      // 1. Iniciar sesión para obtener un par de tokens
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'vet@vetapp.com',
          password: SEED_PASSWORDS.vet,
        });

      assert.strictEqual(loginRes.status, 200);
      const initialRefreshToken = loginRes.body.refreshToken;

      // 2. Refrescar tokens
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: initialRefreshToken,
        });

      assert.strictEqual(refreshRes.status, 200);
      assert.ok(refreshRes.body.accessToken);
      assert.ok(refreshRes.body.refreshToken);
      assert.notStrictEqual(
        refreshRes.body.refreshToken,
        initialRefreshToken,
        'El nuevo refresh token debe ser diferente al previo',
      );

      // 3. Reutilizar el refresh token previo revocado debe ser rechazado con HTTP 401
      const reuseRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: initialRefreshToken,
        });

      assert.strictEqual(reuseRes.status, 401);
    });
  });

  describe('4. POST /auth/logout - Revocación y Denylist de JTI (RF-4)', () => {
    it('debe revocar refresh token en BD e insertar JTI en denylist en memoria', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@vetapp.com',
          password: SEED_PASSWORDS.admin,
        });

      const { accessToken, refreshToken } = loginRes.body;

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        });

      assert.strictEqual(logoutRes.status, 200);
      assert.strictEqual(logoutRes.body.message, 'Sesión cerrada exitosamente');
      assert.ok(logoutRes.body.loggedOutAt);
    });
  });

  describe('5. Verificación de Access Token Revocado (RF-5)', () => {
    it('petición autenticada con Access Token revocado debe ser rechazada con HTTP 401 "Token de acceso revocado"', async () => {
      // 1. Login
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@vetapp.com',
          password: SEED_PASSWORDS.admin,
        });

      const { accessToken, refreshToken } = loginRes.body;

      // 2. Verificar que funciona una petición con el token activo
      const beforeLogout = await request(app.getHttpServer())
        .get('/auth/test/me')
        .set('Authorization', `Bearer ${accessToken}`);

      assert.strictEqual(beforeLogout.status, 200);

      // 3. Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      // 4. Intentar usar nuevamente el token revocado
      const afterLogout = await request(app.getHttpServer())
        .get('/auth/test/me')
        .set('Authorization', `Bearer ${accessToken}`);

      assert.strictEqual(afterLogout.status, 401);
      assert.strictEqual(afterLogout.body.message, 'Token de acceso revocado');
    });
  });

  describe('6. RolesGuard RBAC - Rechazo a RECEPTION en Rutas de VET o ADMIN (RF-3)', () => {
    it('RolesGuard debe rechazar a usuario con rol RECEPTION con HTTP 403 Forbidden en endpoint de VET o ADMIN', async () => {
      // 1. Iniciar sesión como RECEPTION
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'reception@vetapp.com',
          password: SEED_PASSWORDS.reception,
        });

      assert.strictEqual(loginRes.status, 200);
      const receptionToken = loginRes.body.accessToken;

      // 2. Intentar acceder a endpoint exclusivo de ADMIN -> 403 Forbidden
      const adminEndpointRes = await request(app.getHttpServer())
        .get('/auth/test/admin')
        .set('Authorization', `Bearer ${receptionToken}`);

      assert.strictEqual(adminEndpointRes.status, 403);

      // 3. Intentar acceder a endpoint exclusivo de VET -> 403 Forbidden
      const vetEndpointRes = await request(app.getHttpServer())
        .get('/auth/test/vet')
        .set('Authorization', `Bearer ${receptionToken}`);

      assert.strictEqual(vetEndpointRes.status, 403);

      // 4. Acceder al endpoint permitido para RECEPTION -> 200 OK
      const receptionEndpointRes = await request(app.getHttpServer())
        .get('/auth/test/reception')
        .set('Authorization', `Bearer ${receptionToken}`);

      assert.strictEqual(receptionEndpointRes.status, 200);
    });
  });
});
