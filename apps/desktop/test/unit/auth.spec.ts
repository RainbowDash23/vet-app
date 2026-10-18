import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary, LoginResponseDto } from '@vet-app/shared-types';

import { ApiClient } from '../../src/services/api.client.ts';
import { AuthService } from '../../src/services/auth.service.ts';
import { AuthProvider, useAuth } from '../../src/context/auth.context.tsx';
import { LoginScreen } from '../../src/screens/login-screen.tsx';

describe('Contexto de Autenticación, Cliente HTTP y Pantalla de Acceso (T31 / RF-1, RF-2, RF-3, RF-4, RF-6, RNF-2, RNF-3)', () => {
  // Mock fetch helper
  type FetchCall = { url: string; options?: RequestInit };

  function createMockFetch(
    handler: (url: string, options?: RequestInit) => Promise<Response>,
  ) {
    const calls: FetchCall[] = [];
    const mockFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, options: init });
      return handler(url, init);
    };
    return { fn: mockFn as unknown as typeof fetch, calls };
  }

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('1. Cliente HTTP e Inyección de JWT (api.client.ts)', () => {
    let apiClient: ApiClient;

    beforeEach(() => {
      apiClient = new ApiClient({ baseUrl: 'http://localhost:3000' });
    });

    it('debe almacenar tokens estrictamente en memoria (RNF-2: cero persistencia en disco)', () => {
      apiClient.setTokens('access-token-123', 'refresh-token-456');

      assert.equal(apiClient.getAccessToken(), 'access-token-123');
      assert.equal(apiClient.getRefreshToken(), 'refresh-token-456');

      apiClient.clearTokens();
      assert.equal(apiClient.getAccessToken(), null);
      assert.equal(apiClient.getRefreshToken(), null);
    });

    it('debe inyectar automáticamente cabecera Authorization: Bearer <accessToken> en peticiones protegidas', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async () => {
        return jsonResponse({ data: 'mock-data' });
      });

      apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      apiClient.setTokens('jwt-token-abc', 'refresh-xyz');

      const res = await apiClient.get<{ data: string }>('/pets');

      assert.equal(res.data, 'mock-data');
      assert.equal(calls.length, 1);
      const headers = new Headers(calls[0].options?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer jwt-token-abc');
    });

    it('debe capturar respuesta 401, refrescar tokens atómicamente y reintentar la petición original exitosamente (RF-6)', async () => {
      let callCount = 0;
      let refreshCalled = false;

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        const headers = new Headers(opts?.headers);

        if (url.endsWith('/auth/refresh')) {
          refreshCalled = true;
          const body = JSON.parse((opts?.body as string) || '{}');
          assert.equal(body.refreshToken, 'initial-refresh-token');
          return jsonResponse({
            accessToken: 'refreshed-access-token',
            refreshToken: 'new-refresh-token',
            clinicId: 'clinic-1',
            user: {
              id: 'user-1',
              email: 'vet@clinic.com',
              name: 'Dr. Vet',
              role: Role.VET,
              clinicId: 'clinic-1',
            },
          });
        }

        if (url.endsWith('/protected/resource')) {
          callCount++;
          if (callCount === 1) {
            assert.equal(headers.get('Authorization'), 'Bearer expired-token');
            return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401);
          }
          if (callCount === 2) {
            assert.equal(headers.get('Authorization'), 'Bearer refreshed-access-token');
            return jsonResponse({ result: 'success-after-refresh' });
          }
        }

        return jsonResponse({ error: 'not-found' }, 404);
      });

      apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      apiClient.setTokens('expired-token', 'initial-refresh-token');

      const result = await apiClient.get<{ result: string }>('/protected/resource');

      assert.equal(result.result, 'success-after-refresh');
      assert.equal(refreshCalled, true, 'Debe haber llamado a POST /auth/refresh');
      assert.equal(callCount, 2, 'Debe haber llamado al recurso original 2 veces');
      assert.equal(apiClient.getAccessToken(), 'refreshed-access-token');
      assert.equal(apiClient.getRefreshToken(), 'new-refresh-token');
    });

    it('debe manejar múltiples peticiones concurrentes con 401 ejecutando un único refresco atómico (RF-6)', async () => {
      let refreshCallCount = 0;

      const { fn: mockFetch } = createMockFetch(async (url, opts) => {
        const headers = new Headers(opts?.headers);

        if (url.endsWith('/auth/refresh')) {
          refreshCallCount++;
          // Pequeño retardo para simular latencia de red
          await new Promise((resolve) => setTimeout(resolve, 20));
          return jsonResponse({
            accessToken: 'shared-refreshed-token',
            refreshToken: 'shared-new-refresh-token',
            clinicId: 'clinic-1',
            user: {
              id: 'user-1',
              email: 'admin@clinic.com',
              name: 'Admin',
              role: Role.ADMIN,
              clinicId: 'clinic-1',
            },
          });
        }

        if (headers.get('Authorization') === 'Bearer initial-expired-token') {
          return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401);
        }

        if (headers.get('Authorization') === 'Bearer shared-refreshed-token') {
          return jsonResponse({ path: url, status: 'ok' });
        }

        return jsonResponse({ error: 'unauthorized' }, 401);
      });

      apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      apiClient.setTokens('initial-expired-token', 'valid-refresh-token');

      // Lanzar 3 peticiones simultáneas
      const [r1, r2, r3] = await Promise.all([
        apiClient.get<{ path: string }>('/endpoint-1'),
        apiClient.get<{ path: string }>('/endpoint-2'),
        apiClient.get<{ path: string }>('/endpoint-3'),
      ]);

      assert.equal(refreshCallCount, 1, 'Debe haber ejecutado exactamente 1 refresco para todas las peticiones concurrentes');
      assert.ok(r1.path.endsWith('/endpoint-1'));
      assert.ok(r2.path.endsWith('/endpoint-2'));
      assert.ok(r3.path.endsWith('/endpoint-3'));
      assert.equal(apiClient.getAccessToken(), 'shared-refreshed-token');
    });

    it('debe purgar credenciales y disparar onUnauthorized si el 401 ocurre sin refresh token o el refresh falla (RF-4)', async () => {
      let unauthorizedNotified = false;

      const { fn: mockFetch } = createMockFetch(async (url) => {
        if (url.endsWith('/auth/refresh')) {
          return jsonResponse({ statusCode: 401, message: 'Refresh token revocado' }, 401);
        }
        return jsonResponse({ statusCode: 401, message: 'Token expirado' }, 401);
      });

      apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      apiClient.setTokens('expired-token', 'revoked-refresh-token');
      apiClient.onUnauthorized(() => {
        unauthorizedNotified = true;
      });

      await assert.rejects(
        async () => {
          await apiClient.get('/some-data');
        },
        /401|Unauthorized/i,
      );

      assert.equal(unauthorizedNotified, true, 'Debe haber disparado la notificación onUnauthorized');
      assert.equal(apiClient.getAccessToken(), null, 'Debe haber purgado el access token');
      assert.equal(apiClient.getRefreshToken(), null, 'Debe haber purgado el refresh token');
    });
  });

  describe('2. Servicio de Autenticación (auth.service.ts)', () => {
    it('login debe remitir credenciales a POST /auth/login y retornar tokens (RF-1)', async () => {
      const mockResponse: LoginResponseDto = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        clinicId: 'clinic-a',
        user: {
          id: 'u-1',
          email: 'vet@test.com',
          name: 'Dra. Ana',
          role: Role.VET,
          clinicId: 'clinic-a',
        },
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        assert.ok(url.endsWith('/auth/login'));
        assert.equal(opts?.method, 'POST');
        const body = JSON.parse((opts?.body as string) || '{}');
        assert.equal(body.email, 'vet@test.com');
        assert.equal(body.password, 'secret123');
        return jsonResponse(mockResponse);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const authService = new AuthService(apiClient);

      const result = await authService.login('vet@test.com', 'secret123');

      assert.equal(result.accessToken, 'access-123');
      assert.equal(result.user.role, Role.VET);
      assert.equal(calls.length, 1);
    });

    it('refresh debe invocar POST /auth/refresh con el refreshToken (RF-6)', async () => {
      const mockResponse: LoginResponseDto = {
        accessToken: 'new-access-789',
        refreshToken: 'new-refresh-012',
        clinicId: 'clinic-a',
        user: {
          id: 'u-1',
          email: 'vet@test.com',
          name: 'Dra. Ana',
          role: Role.VET,
          clinicId: 'clinic-a',
        },
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        assert.ok(url.endsWith('/auth/refresh'));
        const body = JSON.parse((opts?.body as string) || '{}');
        assert.equal(body.refreshToken, 'old-refresh-456');
        return jsonResponse(mockResponse);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const authService = new AuthService(apiClient);

      const result = await authService.refresh('old-refresh-456');

      assert.equal(result.accessToken, 'new-access-789');
      assert.equal(calls.length, 1);
    });

    it('logout debe enviar POST /auth/logout con cabecera y cuerpo de revocación (RF-4)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        assert.ok(url.endsWith('/auth/logout'));
        assert.equal(opts?.method, 'POST');
        const headers = new Headers(opts?.headers);
        assert.equal(headers.get('Authorization'), 'Bearer access-token-active');
        const body = JSON.parse((opts?.body as string) || '{}');
        assert.equal(body.refreshToken, 'refresh-token-active');
        return jsonResponse({ success: true, message: 'Sesión cerrada exitosamente' });
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const authService = new AuthService(apiClient);

      const res = await authService.logout('access-token-active', 'refresh-token-active');

      assert.equal(res.success, true);
      assert.equal(calls.length, 1);
    });
  });

  describe('3. Contexto de Autenticación y Verificación RBAC (auth.context.tsx)', () => {
    it('debe iniciar en estado desautenticado por defecto', () => {
      let contextValue: ReturnType<typeof useAuth> | null = null;

      function TestConsumer() {
        contextValue = useAuth();
        return React.createElement('div', null, 'Consumer');
      }

      renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(TestConsumer),
        ),
      );

      assert.ok(contextValue);
      assert.equal((contextValue as any).isAuthenticated, false);
      assert.equal((contextValue as any).user, null);
      assert.equal((contextValue as any).role, null);
      assert.equal((contextValue as any).clinicId, null);
    });

    it('hasRole debe evaluar correctamente los roles del usuario (RF-3)', () => {
      const adminUser: AuthUserSummary = {
        id: 'u-admin',
        email: 'admin@clinic.com',
        name: 'Administrador',
        role: Role.ADMIN,
        clinicId: 'clinic-1',
      };

      let contextValue: ReturnType<typeof useAuth> | null = null;

      function TestConsumer() {
        contextValue = useAuth();
        return React.createElement('div', null, 'Consumer');
      }

      renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: adminUser },
          React.createElement(TestConsumer),
        ),
      );

      assert.ok(contextValue);
      const auth = contextValue as NonNullable<typeof contextValue>;

      assert.equal(auth.isAuthenticated, true);
      assert.equal(auth.role, Role.ADMIN);
      assert.equal(auth.hasRole(Role.ADMIN), true, 'ADMIN debe satisfacer hasRole(ADMIN)');
      assert.equal(auth.hasRole(Role.VET), false, 'ADMIN no es VET');
      assert.equal(auth.hasRole(Role.RECEPTION), false, 'ADMIN no es RECEPTION');
      assert.equal(auth.hasRole(Role.ADMIN, Role.VET), true, 'ADMIN satisface hasRole(ADMIN, VET)');
    });

    it('hasRole debe restringir VET y RECEPTION según la matriz RBAC (RF-3)', () => {
      const vetUser: AuthUserSummary = {
        id: 'u-vet',
        email: 'vet@clinic.com',
        name: 'Dra. Gómez',
        role: Role.VET,
        clinicId: 'clinic-1',
      };

      let contextValue: ReturnType<typeof useAuth> | null = null;

      function TestConsumer() {
        contextValue = useAuth();
        return React.createElement('div', null, 'Consumer');
      }

      renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: vetUser },
          React.createElement(TestConsumer),
        ),
      );

      assert.ok(contextValue);
      const auth = contextValue as NonNullable<typeof contextValue>;

      assert.equal(auth.hasRole(Role.VET), true);
      assert.equal(auth.hasRole(Role.ADMIN), false);
      assert.equal(auth.hasRole(Role.RECEPTION), false);
    });
  });

  describe('4. Pantalla de Acceso (login-screen.tsx / RF-2)', () => {
    it('debe renderizar campos de email, password y botón de submit accesible', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(LoginScreen),
        ),
      );

      assert.ok(html.includes('type="email"'), 'Debe incluir input de email');
      assert.ok(html.includes('type="password"'), 'Debe incluir input de password');
      assert.ok(html.includes('type="submit"'), 'Debe incluir botón type="submit"');
      assert.ok(html.includes('Correo Electrónico') || html.includes('email'), 'Debe tener label descriptiva para email');
      assert.ok(html.includes('Contraseña') || html.includes('password'), 'Debe tener label descriptiva para password');
    });

    it('debe desplegar mensaje de error accesible (role="alert") ante fallo de autenticación (RF-2)', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(LoginScreen, { errorMessage: 'Credenciales de acceso inválidas' }),
        ),
      );

      assert.ok(html.includes('role="alert"'), 'Debe tener contenedor con role="alert" para retroalimentación accesible');
      assert.ok(html.includes('Credenciales de acceso inválidas'), 'Debe mostrar el mensaje de error provisto');
    });

    it('debe reflejar estado de carga en botón de envío (isLoading con spinner)', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(LoginScreen, { isLoading: true }),
        ),
      );

      assert.ok(
        html.includes('aria-busy="true"') || html.includes('spinner') || html.includes('disabled'),
        'Debe reflejar estado de carga en el botón o formulario',
      );
    });
  });

  describe('5. Auditoría Estricta de RNF-3 en Autenticación (Cero Tailwind, Cero shadcn)', () => {
    it('los archivos de servicios, contexto y pantallas no deben contener clases de Tailwind CSS ni componentes de shadcn', () => {
      const targetFiles = [
        path.join(process.cwd(), 'apps/desktop/src/services/api.client.ts'),
        path.join(process.cwd(), 'apps/desktop/src/services/auth.service.ts'),
        path.join(process.cwd(), 'apps/desktop/src/context/auth.context.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/screens/login-screen.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/screens/login-screen.module.css'),
      ];

      for (const filePath of targetFiles) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');

        assert.doesNotMatch(
          content,
          /@apply\s+/,
          `El archivo ${path.basename(filePath)} no debe usar @apply de Tailwind`,
        );
        assert.doesNotMatch(
          content,
          /@\/components\/ui/,
          `El archivo ${path.basename(filePath)} no debe importar rutas de shadcn (@/components/ui)`,
        );
        assert.doesNotMatch(
          content,
          /tailwind/i,
          `El archivo ${path.basename(filePath)} no debe referenciar Tailwind`,
        );
      }
    });
  });
});
