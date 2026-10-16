import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { Roles, ROLES_KEY } from '../../src/common/decorators/roles.decorator';

describe('RolesGuard & @Roles (T09 / RF-3)', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  const createMockExecutionContext = (
    handlerMetadata?: Role[],
    classMetadata?: Role[],
    user?: { role?: Role; [key: string]: unknown },
  ): ExecutionContext => {
    const handler = () => {};
    class TestController {}

    if (handlerMetadata) {
      Reflect.defineMetadata(ROLES_KEY, handlerMetadata, handler);
    }
    if (classMetadata) {
      Reflect.defineMetadata(ROLES_KEY, classMetadata, TestController);
    }

    const mockRequest = {
      user,
    };

    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  };

  describe('a) Permite acceso si la ruta no tiene @Roles', () => {
    it('debe retornar true si no hay metadata de roles a nivel de método ni de clase', () => {
      const context = createMockExecutionContext(undefined, undefined, { role: Role.RECEPTION });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe retornar true si no hay roles requeridos incluso sin usuario en el request', () => {
      const context = createMockExecutionContext(undefined, undefined, undefined);
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe retornar true si la metadata de roles es un arreglo vacío', () => {
      const context = createMockExecutionContext([], [], { role: Role.VET });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });
  });

  describe('b) Permite acceso si el usuario tiene el rol requerido', () => {
    it('debe permitir acceso a ADMIN en una ruta con @Roles(Role.ADMIN)', () => {
      const context = createMockExecutionContext([Role.ADMIN], undefined, { role: Role.ADMIN });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe permitir acceso a VET en una ruta con @Roles(Role.VET, Role.ADMIN)', () => {
      const context = createMockExecutionContext([Role.VET, Role.ADMIN], undefined, { role: Role.VET });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe permitir acceso a ADMIN en una ruta configurada a nivel de clase de controlador', () => {
      const context = createMockExecutionContext(undefined, [Role.ADMIN], { role: Role.ADMIN });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('la metadata del método debe sobreescribir la de la clase (getAllAndOverride)', () => {
      // Clase requiere ADMIN, pero método permite RECEPTION y ADMIN
      const context = createMockExecutionContext([Role.RECEPTION, Role.ADMIN], [Role.ADMIN], {
        role: Role.RECEPTION,
      });
      const canActivate = rolesGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });
  });

  describe('c) Bloquea con HTTP 403 Forbidden cuando RECEPTION intenta acceder a rutas exclusivas (RF-3)', () => {
    it('debe lanzar ForbiddenException cuando RECEPTION intenta acceder a ruta exclusiva de VET (diagnósticos, constantes vitales)', () => {
      const context = createMockExecutionContext([Role.VET], undefined, { role: Role.RECEPTION });

      assert.throws(
        () => rolesGuard.canActivate(context),
        (err: unknown) => {
          assert(err instanceof ForbiddenException, 'Debe ser instancia de ForbiddenException');
          assert.strictEqual(err.getStatus(), 403);
          const response = err.getResponse();
          const message = typeof response === 'string' ? response : (response as { message: string }).message;
          assert(
            message.includes('Acceso denegado') && message.includes('RECEPTION') && message.includes('VET'),
            `El mensaje de error debe indicar el rol faltante y el rol actual: ${message}`,
          );
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException cuando RECEPTION intenta acceder a ruta exclusiva de VET o ADMIN', () => {
      const context = createMockExecutionContext([Role.VET, Role.ADMIN], undefined, { role: Role.RECEPTION });

      assert.throws(
        () => rolesGuard.canActivate(context),
        (err: unknown) => {
          assert(err instanceof ForbiddenException);
          assert.strictEqual(err.getStatus(), 403);
          const response = err.getResponse();
          const message = typeof response === 'string' ? response : (response as { message: string }).message;
          assert(message.includes('VET, ADMIN') && message.includes('RECEPTION'));
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException cuando VET intenta acceder a ruta exclusiva de ADMIN', () => {
      const context = createMockExecutionContext([Role.ADMIN], undefined, { role: Role.VET });

      assert.throws(
        () => rolesGuard.canActivate(context),
        (err: unknown) => {
          assert(err instanceof ForbiddenException);
          assert.strictEqual(err.getStatus(), 403);
          return true;
        },
      );
    });
  });

  describe('d) Bloquea con HTTP 403 si el usuario en request no tiene credenciales de rol', () => {
    it('debe lanzar ForbiddenException si no existe usuario autenticado en la petición (request.user no definido)', () => {
      const context = createMockExecutionContext([Role.ADMIN], undefined, undefined);

      assert.throws(
        () => rolesGuard.canActivate(context),
        (err: unknown) => {
          assert(err instanceof ForbiddenException);
          assert.strictEqual(err.getStatus(), 403);
          const response = err.getResponse();
          const message = typeof response === 'string' ? response : (response as { message: string }).message;
          assert(message.includes('credenciales de rol'));
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException si el usuario existe pero no tiene propiedad role', () => {
      const context = createMockExecutionContext([Role.ADMIN], undefined, {});

      assert.throws(
        () => rolesGuard.canActivate(context),
        (err: unknown) => {
          assert(err instanceof ForbiddenException);
          assert.strictEqual(err.getStatus(), 403);
          const response = err.getResponse();
          const message = typeof response === 'string' ? response : (response as { message: string }).message;
          assert(message.includes('credenciales de rol'));
          return true;
        },
      );
    });
  });

  describe('e) Verificación del decorador @Roles', () => {
    it('debe establecer la metadata ROLES_KEY con los roles suministrados', () => {
      class SampleService {
        @Roles(Role.ADMIN, Role.VET)
        action() {}
      }

      const instance = new SampleService();
      const metadata = Reflect.getMetadata(ROLES_KEY, instance.action);
      assert.deepStrictEqual(metadata, [Role.ADMIN, Role.VET]);
    });
  });

  describe('f) Compatibilidad de re-exportaciones desde auth y common', async () => {
    it('RolesGuard y Roles de auth deben ser idénticos a los de common', async () => {
      const authGuards = await import('../../src/modules/auth/guards/roles.guard');
      const authDecorators = await import('../../src/modules/auth/decorators/roles.decorator');

      assert.strictEqual(authGuards.RolesGuard, RolesGuard);
      assert.strictEqual(authDecorators.Roles, Roles);
      assert.strictEqual(authDecorators.ROLES_KEY, ROLES_KEY);
    });
  });
});

