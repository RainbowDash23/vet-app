import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User, RefreshToken } from '@prisma/client';
import { AuthService, LoginResponse } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { LoginDto } from '../../src/modules/auth/dto/login.dto';
import { RefreshDto } from '../../src/modules/auth/dto/refresh.dto';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuthService & AuthController (T07 / RF-1, RF-2, RF-6)', () => {
  let authService: AuthService;
  let authController: AuthController;
  let mockPrisma: any;
  let mockJwtService: any;

  const mockUser: User = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@clinica-norte.com',
    password: '', // poblado en beforeEach con hash bcrypt
    name: 'Dra. María González',
    role: Role.ADMIN,
    clinicId: '22222222-2222-4222-8222-222222222222',
    licenseNumber: 'MP-998822',
    phone: '+593991234567',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const plainPassword = 'SuperSecretPassword123!';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    mockUser.password = passwordHash;

    // Repositorio en memoria para simular Prisma
    const refreshTokensDb: (RefreshToken & { user?: User })[] = [];

    mockPrisma = {
      user: {
        findFirst: async ({ where }: any) => {
          if (where.email && where.email !== mockUser.email.toLowerCase()) {
            return null;
          }
          if (where.deletedAt === null && mockUser.deletedAt !== null) {
            return null;
          }
          return mockUser;
        },
        findUnique: async ({ where }: any) => {
          if (where.id === mockUser.id) {
            return mockUser;
          }
          return null;
        },
      },
      refreshToken: {
        findFirst: async ({ where, include }: any) => {
          const found = refreshTokensDb.find((t) => {
            if (t.tokenHash !== where.tokenHash) return false;
            if (where.revokedAt === null && t.revokedAt !== null) return false;
            if (where.expiresAt?.gt && t.expiresAt <= where.expiresAt.gt) return false;
            return true;
          });
          if (!found) return null;
          if (include?.user) {
            return { ...found, user: mockUser };
          }
          return found;
        },
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
        update: async ({ where, data }: any) => {
          const index = refreshTokensDb.findIndex((t) => t.id === where.id);
          if (index === -1) throw new Error('RefreshToken not found');
          Object.assign(refreshTokensDb[index], data);
          return refreshTokensDb[index];
        },
      },
      $transaction: async (fn: (tx: any) => Promise<any>) => {
        return fn(mockPrisma);
      },
      _db: { refreshTokensDb },
    };

    mockJwtService = {
      signAsync: async (payload: any, options?: any) => {
        return `mock.jwt.token.${payload.sub}.${payload.role}.${options?.jwtid || payload.jti || 'no-jti'}`;
      },
      decode: (token: string) => {
        const parts = token.split('.');
        return { sub: parts[3], role: parts[4], jti: parts[5] };
      },
    };

    authService = new AuthService(mockPrisma as unknown as PrismaService, mockJwtService as unknown as JwtService);
    authController = new AuthController(authService);
  });

  describe('1. Emisión de Access Token y Refresh Token con credenciales válidas (RF-1)', () => {
    it('debe generar Access Token (15m con jti) y Refresh Token (7d) persistido en BD', async () => {
      const loginDto: LoginDto = {
        email: 'ADMIN@clinica-norte.com', // probando normalización de mayúsculas
        password: plainPassword,
      };

      const response: LoginResponse = await authService.login(loginDto);

      assert.ok(response.accessToken, 'Debe incluir accessToken');
      assert.ok(response.refreshToken, 'Debe incluir refreshToken');
      assert.strictEqual(response.expiresIn, '15m', 'El tiempo de vida del Access Token debe ser 15m');
      assert.strictEqual(response.user.id, mockUser.id);
      assert.strictEqual(response.user.email, mockUser.email);
      assert.strictEqual(response.user.role, mockUser.role);
      assert.strictEqual(response.user.clinicId, mockUser.clinicId);

      // Verificar que el Refresh Token se persistió como hash SHA-256 en la base de datos
      const expectedHash = crypto.createHash('sha256').update(response.refreshToken).digest('hex');
      const persistedRecord = mockPrisma._db.refreshTokensDb.find(
        (t: RefreshToken) => t.tokenHash === expectedHash,
      );

      assert.ok(persistedRecord, 'El Refresh Token debe existir persistido en la tabla refresh_tokens');
      assert.strictEqual(persistedRecord.userId, mockUser.id);
      assert.strictEqual(persistedRecord.revokedAt, null);

      // Verificar vigencia del Refresh Token (aproximadamente 7 días)
      const now = Date.now();
      const expiresAtMs = persistedRecord.expiresAt.getTime();
      const diffDays = (expiresAtMs - now) / (1000 * 60 * 60 * 24);
      assert.ok(diffDays >= 6.9 && diffDays <= 7.1, `La expiración debe ser de 7 días (+/- tolerancia), fue: ${diffDays}`);
    });
  });

  describe('2. Rechazo ante credenciales inválidas o usuario no operativo (RF-2)', () => {
    it('debe rechazar con 401 Unauthorized cuando el usuario no existe', async () => {
      const loginDto: LoginDto = {
        email: 'inexistente@clinica.com',
        password: plainPassword,
      };

      await assert.rejects(
        async () => {
          await authService.login(loginDto);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Credenciales de acceso inválidas');
          return true;
        },
      );
    });

    it('debe rechazar con 401 Unauthorized cuando la contraseña es incorrecta', async () => {
      const loginDto: LoginDto = {
        email: mockUser.email,
        password: 'PasswordIncorrecta999!',
      };

      await assert.rejects(
        async () => {
          await authService.login(loginDto);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Credenciales de acceso inválidas');
          return true;
        },
      );
    });

    it('debe rechazar con 401 Unauthorized cuando el usuario fue borrado lógicamente', async () => {
      mockUser.deletedAt = new Date();

      const loginDto: LoginDto = {
        email: mockUser.email,
        password: plainPassword,
      };

      await assert.rejects(
        async () => {
          await authService.login(loginDto);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.strictEqual(err.message, 'Credenciales de acceso inválidas');
          return true;
        },
      );

      mockUser.deletedAt = null;
    });

    it('debe rechazar con 401 Unauthorized cuando el usuario está inactivo', async () => {
      mockUser.isActive = false;

      const loginDto: LoginDto = {
        email: mockUser.email,
        password: plainPassword,
      };

      await assert.rejects(
        async () => {
          await authService.login(loginDto);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.ok(err.message.toLowerCase().includes('inactivo'));
          return true;
        },
      );

      mockUser.isActive = true;
    });
  });

  describe('3. Rotación atómica de Refresh Token (RF-6)', () => {
    it('debe revocar el Refresh Token anterior y emitir un nuevo par de tokens atómicamente', async () => {
      // Primero hacemos login para obtener un Refresh Token inicial
      const initialLogin = await authService.login({
        email: mockUser.email,
        password: plainPassword,
      });

      const initialRefreshToken = initialLogin.refreshToken;
      const initialHash = crypto.createHash('sha256').update(initialRefreshToken).digest('hex');

      const initialPersisted = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.tokenHash === initialHash);
      assert.ok(initialPersisted);
      assert.strictEqual(initialPersisted.revokedAt, null);

      // Ahora solicitamos la rotación enviando el refresh token
      const refreshDto: RefreshDto = {
        refreshToken: initialRefreshToken,
      };

      const refreshedResponse = await authService.refreshTokens(refreshDto);

      assert.ok(refreshedResponse.accessToken, 'Debe generar nuevo Access Token');
      assert.ok(refreshedResponse.refreshToken, 'Debe generar nuevo Refresh Token');
      assert.notStrictEqual(refreshedResponse.refreshToken, initialRefreshToken, 'El nuevo Refresh Token debe ser diferente al original');

      // Verificar que el token anterior fue revocado (revokedAt poblado)
      assert.ok(initialPersisted.revokedAt !== null, 'El token original debe marcarse como revocado');

      // Verificar que el nuevo token fue persistido y activo
      const newHash = crypto.createHash('sha256').update(refreshedResponse.refreshToken).digest('hex');
      const newPersisted = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.tokenHash === newHash);

      assert.ok(newPersisted, 'El nuevo Refresh Token debe estar persistido');
      assert.strictEqual(newPersisted.revokedAt, null, 'El nuevo token debe estar activo sin revocar');
      assert.strictEqual(newPersisted.userId, mockUser.id);
    });

    it('debe rechazar con 401 Unauthorized si el Refresh Token ya fue revocado', async () => {
      const login = await authService.login({
        email: mockUser.email,
        password: plainPassword,
      });

      // Revocar manualmente en DB
      const hash = crypto.createHash('sha256').update(login.refreshToken).digest('hex');
      const persisted = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.tokenHash === hash);
      persisted.revokedAt = new Date();

      await assert.rejects(
        async () => {
          await authService.refreshTokens({ refreshToken: login.refreshToken });
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          return true;
        },
      );
    });

    it('debe rechazar con 401 Unauthorized si el Refresh Token está expirado', async () => {
      const login = await authService.login({
        email: mockUser.email,
        password: plainPassword,
      });

      // Modificar fecha de expiración en el pasado
      const hash = crypto.createHash('sha256').update(login.refreshToken).digest('hex');
      const persisted = mockPrisma._db.refreshTokensDb.find((t: RefreshToken) => t.tokenHash === hash);
      persisted.expiresAt = new Date(Date.now() - 10000); // 10 segundos atrás

      await assert.rejects(
        async () => {
          await authService.refreshTokens({ refreshToken: login.refreshToken });
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          return true;
        },
      );
    });

    it('debe rechazar con 401 Unauthorized si el token no existe en la base de datos', async () => {
      await assert.rejects(
        async () => {
          await authService.refreshTokens({ refreshToken: 'random-unregistered-token' });
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          return true;
        },
      );
    });
  });

  describe('4. AuthController endpoints POST /auth/login y POST /auth/refresh', () => {
    it('debe responder a través de login() en el controlador', async () => {
      const response = await authController.login({
        email: mockUser.email,
        password: plainPassword,
      });

      assert.ok(response.accessToken);
      assert.ok(response.refreshToken);
    });

    it('debe responder a través de refresh() en el controlador', async () => {
      const loginRes = await authController.login({
        email: mockUser.email,
        password: plainPassword,
      });

      const refreshRes = await authController.refresh({
        refreshToken: loginRes.refreshToken,
      });

      assert.ok(refreshRes.accessToken);
      assert.ok(refreshRes.refreshToken);
    });
  });
});
