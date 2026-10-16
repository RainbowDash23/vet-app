import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User, RefreshToken } from '@prisma/client';
import { TokenRevocationService } from '../../src/modules/auth/token-revocation.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../src/modules/auth/interfaces/jwt-payload.interface';

describe('TokenRevocationService, JwtAuthGuard & Logout (T08 / RF-4, RF-5)', () => {
  let tokenRevocationService: TokenRevocationService;
  let authService: AuthService;
  let authController: AuthController;
  let jwtAuthGuard: JwtAuthGuard;
  let jwtService: JwtService;
  let configService: ConfigService;
  let mockPrisma: any;

  const jwtSecret = 'test-jwt-secret-key-for-revocation-tests-12345';

  const mockUser: User = {
    id: 'user-uuid-1111-2222-3333-444455556666',
    email: 'vet@clinica-veterinaria.com',
    password: 'hashed-password',
    name: 'Dr. Alejandro Morales',
    role: Role.VET,
    clinicId: 'clinic-uuid-aaaa-bbbb-cccc-ddddeeeeffff',
    licenseNumber: 'VET-12345',
    phone: '+593987654321',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockExecutionContext = (authHeader?: string): { context: ExecutionContext; request: any } => {
    const request: any = {
      headers: authHeader ? { authorization: authHeader } : {},
    };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    };
    return { context, request };
  };

  beforeEach(() => {
    // Base de datos en memoria para refreshTokens
    const refreshTokensDb: RefreshToken[] = [];

    mockPrisma = {
      user: {
        findFirst: async ({ where }: any) => {
          if (where.email && where.email !== mockUser.email.toLowerCase()) return null;
          if (where.deletedAt === null && mockUser.deletedAt !== null) return null;
          return mockUser;
        },
      },
      refreshToken: {
        create: async ({ data }: any) => {
          const record: RefreshToken = {
            id: crypto.randomUUID(),
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            revokedAt: null,
            createdAt: new Date(),
          };
          refreshTokensDb.push(record);
          return record;
        },
        findFirst: async ({ where }: any) => {
          return refreshTokensDb.find((t) => {
            if (t.tokenHash !== where.tokenHash) return false;
            if (where.revokedAt === null && t.revokedAt !== null) return false;
            return true;
          }) || null;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const item of refreshTokensDb) {
            let match = true;
            if (where.userId && item.userId !== where.userId) match = false;
            if (where.tokenHash && item.tokenHash !== where.tokenHash) match = false;
            if (where.revokedAt === null && item.revokedAt !== null) match = false;
            if (match) {
              Object.assign(item, data);
              count++;
            }
          }
          return { count };
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
      _db: { refreshTokensDb },
    };

    configService = {
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return jwtSecret;
        throw new Error(`Config key not found: ${key}`);
      },
      get: (key: string, defaultValue?: any) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        return defaultValue;
      },
    } as any;

    jwtService = new JwtService({ secret: jwtSecret });
    tokenRevocationService = new TokenRevocationService(mockPrisma);
    authService = new AuthService(mockPrisma, jwtService, tokenRevocationService);
    authController = new AuthController(authService);
    jwtAuthGuard = new JwtAuthGuard(jwtService, configService, tokenRevocationService);
  });

  describe('1. TokenRevocationService: Denylist de JTI en memoria y revocación en BD', () => {
    it('debe registrar un JTI como revocado y verificar su vigencia en la lista de revocaciones', () => {
      const jti = 'jti-valid-test-1';
      const expiresAt = new Date(Date.now() + 60000); // 1 minuto en el futuro

      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), false);

      tokenRevocationService.revokeToken(jti, expiresAt);

      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), true);
    });

    it('debe considerar no revocado a un JTI cuyo TTL ya haya expirado y purgarlo', () => {
      const jti = 'jti-expired-test-2';
      const expiredDate = new Date(Date.now() - 5000); // Expiró hace 5 segundos

      tokenRevocationService.revokeToken(jti, expiredDate);

      // Al consultar un token cuyo TTL ya pasó, debe devolver false y retirarlo
      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), false);
    });

    it('debe purgar múltiples tokens expirados con purgeExpiredTokens()', () => {
      const now = Date.now();
      tokenRevocationService.revokeToken('expired-1', new Date(now - 20000));
      tokenRevocationService.revokeToken('expired-2', new Date(now - 10000));
      tokenRevocationService.revokeToken('active-1', new Date(now + 60000));
      tokenRevocationService.revokeToken('active-2', new Date(now + 120000));

      const purgedCount = tokenRevocationService.purgeExpiredTokens();
      assert.strictEqual(purgedCount, 2);

      assert.strictEqual(tokenRevocationService.isTokenRevoked('expired-1'), false);
      assert.strictEqual(tokenRevocationService.isTokenRevoked('expired-2'), false);
      assert.strictEqual(tokenRevocationService.isTokenRevoked('active-1'), true);
      assert.strictEqual(tokenRevocationService.isTokenRevoked('active-2'), true);
    });

    it('debe revocar todos los refresh tokens activos del usuario en la base de datos', async () => {
      // Crear 3 refresh tokens para el usuario mock
      await mockPrisma.refreshToken.create({
        data: { userId: mockUser.id, tokenHash: 'hash1', expiresAt: new Date(Date.now() + 100000) },
      });
      await mockPrisma.refreshToken.create({
        data: { userId: mockUser.id, tokenHash: 'hash2', expiresAt: new Date(Date.now() + 100000) },
      });
      // Token de otro usuario que no debe ser afectado
      await mockPrisma.refreshToken.create({
        data: { userId: 'other-user-id', tokenHash: 'hash3', expiresAt: new Date(Date.now() + 100000) },
      });

      const count = await tokenRevocationService.revokeUserRefreshTokens(mockUser.id);
      assert.strictEqual(count, 2);

      const userTokens = mockPrisma._db.refreshTokensDb.filter((t: RefreshToken) => t.userId === mockUser.id);
      assert.strictEqual(userTokens.length, 2);
      assert.ok(userTokens[0].revokedAt instanceof Date);
      assert.ok(userTokens[1].revokedAt instanceof Date);

      const otherUserToken = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.userId === 'other-user-id');
      assert.strictEqual(otherUserToken.revokedAt, null);
    });
  });

  describe('2. JwtAuthGuard: Rechazo de tokens revocados (RF-5)', () => {
    it('debe permitir acceso cuando el token JWT es válido y su JTI no está revocado', async () => {
      const payload: JwtPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        clinicId: mockUser.clinicId,
        jti: 'jti-clean-token-99',
      };
      const token = await jwtService.signAsync(payload);

      const { context, request } = createMockExecutionContext(`Bearer ${token}`);
      const canActivate = await jwtAuthGuard.canActivate(context);

      assert.strictEqual(canActivate, true);
      assert.strictEqual(request.user.userId, mockUser.id);
      assert.strictEqual(request.user.jti, 'jti-clean-token-99');
    });

    it('debe rechazar con HTTP 401 Unauthorized cuando el JTI del token fue revocado (RF-5)', async () => {
      const jti = 'jti-revoked-token-88';
      const payload: JwtPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        clinicId: mockUser.clinicId,
        jti,
      };
      const token = await jwtService.signAsync(payload);

      // Revocar el token
      tokenRevocationService.revokeToken(jti, new Date(Date.now() + 15 * 60 * 1000));

      const { context } = createMockExecutionContext(`Bearer ${token}`);

      await assert.rejects(
        async () => {
          await jwtAuthGuard.canActivate(context);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Token de acceso revocado');
          return true;
        },
      );
    });

    it('debe rechazar con 401 si no se envía encabezado de autorización', async () => {
      const { context } = createMockExecutionContext(undefined);

      await assert.rejects(
        async () => {
          await jwtAuthGuard.canActivate(context);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Token de autorización no proporcionado');
          return true;
        },
      );
    });

    it('debe rechazar con 401 si la firma del token es inválida', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
      const { context } = createMockExecutionContext(`Bearer ${invalidToken}`);

      await assert.rejects(
        async () => {
          await jwtAuthGuard.canActivate(context);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Token de autorización inválido o expirado');
          return true;
        },
      );
    });
  });

  describe('3. Cierre de sesión y revocación en AuthService y AuthController (RF-4)', () => {
    it('debe cerrar sesión revocando el refresh token en BD y agregando el jti a denylist (RF-4)', async () => {
      const rawRefreshToken = 'sample-raw-refresh-token-value';
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

      await mockPrisma.refreshToken.create({
        data: {
          userId: mockUser.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const jti = 'jti-logout-session-1';
      const expUnix = Math.floor(Date.now() / 1000) + 900; // 15 minutos en segundos

      const logoutResult = await authService.logout(mockUser.id, jti, expUnix, rawRefreshToken);

      assert.strictEqual(logoutResult.message, 'Sesión cerrada exitosamente');
      assert.ok(logoutResult.loggedOutAt);

      // 1. Verificar que el refresh token específico fue revocado en BD
      const storedToken = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.tokenHash === tokenHash);
      assert.ok(storedToken.revokedAt instanceof Date);

      // 2. Verificar que el JTI fue agregado a la denylist
      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), true);

      // 3. Verificar que JwtAuthGuard rechaza de inmediato este token
      const token = await jwtService.signAsync({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        clinicId: mockUser.clinicId,
        jti,
      });

      const { context } = createMockExecutionContext(`Bearer ${token}`);
      await assert.rejects(
        async () => {
          await jwtAuthGuard.canActivate(context);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Token de acceso revocado');
          return true;
        },
      );
    });

    it('debe revocar todos los refresh tokens si no se especifica un token particular', async () => {
      await mockPrisma.refreshToken.create({
        data: { userId: mockUser.id, tokenHash: 'hash-a', expiresAt: new Date(Date.now() + 100000) },
      });
      await mockPrisma.refreshToken.create({
        data: { userId: mockUser.id, tokenHash: 'hash-b', expiresAt: new Date(Date.now() + 100000) },
      });

      const jti = 'jti-logout-all-devices';
      await authService.logout(mockUser.id, jti);

      const tokens = mockPrisma._db.refreshTokensDb.filter((t: RefreshToken) => t.userId === mockUser.id);
      assert.strictEqual(tokens.length, 2);
      assert.ok(tokens[0].revokedAt instanceof Date);
      assert.ok(tokens[1].revokedAt instanceof Date);

      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), true);
    });

    it('debe exponer POST /auth/logout en AuthController invocando logout()', async () => {
      const jti = 'jti-controller-test';
      const currentUser = {
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        clinicId: mockUser.clinicId,
        jti,
        exp: Math.floor(Date.now() / 1000) + 900,
      };

      const response = await authController.logout(currentUser as any, { refreshToken: 'test-refresh' });

      assert.strictEqual(response.message, 'Sesión cerrada exitosamente');
      assert.ok(response.loggedOutAt);
      assert.strictEqual(tokenRevocationService.isTokenRevoked(jti), true);
    });
  });
});
