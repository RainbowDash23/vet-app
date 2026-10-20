import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Reflector } from '@nestjs/core';
import { AccessAction, Role } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccessLogsService } from '../../src/modules/audit/access-logs.service';
import { AccessLogsController } from '../../src/modules/audit/access-logs.controller';
import { CreateAccessLogDto } from '../../src/modules/audit/dto/create-access-log.dto';
import { QueryAccessLogDto } from '../../src/modules/audit/dto/query-access-log.dto';

interface MockAccessLog {
  id: string;
  petId: string;
  clinicId: string | null;
  userId: string | null;
  action: AccessAction;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

describe('AccessLogsService & AccessLogsController (T14 / RF-25, RF-37, RNF-7)', () => {
  let accessLogsService: AccessLogsService;
  let accessLogsController: AccessLogsController;
  let mockPrisma: any;
  let accessLogsDb: MockAccessLog[];

  const validPetId = 'a0000000-0000-4000-8000-000000000001';
  const validClinicId = 'b0000000-0000-4000-8000-000000000001';
  const validUserId = 'c0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    accessLogsDb = [
      {
        id: 'log-1',
        petId: validPetId,
        clinicId: validClinicId,
        userId: validUserId,
        action: AccessAction.NFC_SCAN,
        ipAddress: '192.168.1.100',
        userAgent: 'VetApp-Desktop/1.0',
        timestamp: new Date('2026-10-17T08:00:00Z'),
      },
      {
        id: 'log-2',
        petId: validPetId,
        clinicId: validClinicId,
        userId: validUserId,
        action: AccessAction.HISTORY_VIEW,
        ipAddress: '192.168.1.100',
        userAgent: 'VetApp-Desktop/1.0',
        timestamp: new Date('2026-10-17T08:05:00Z'),
      },
      {
        id: 'log-3',
        petId: validPetId,
        clinicId: null,
        userId: null,
        action: AccessAction.EMERGENCY_SCAN,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0 Mobile',
        timestamp: new Date('2026-10-17T09:00:00Z'),
      },
    ];

    mockPrisma = {
      accessLog: {
        create: async ({ data }: { data: any }) => {
          const newEntry: MockAccessLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            petId: data.petId,
            clinicId: data.clinicId ?? null,
            userId: data.userId ?? null,
            action: data.action,
            ipAddress: data.ipAddress ?? null,
            userAgent: data.userAgent ?? null,
            timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(),
          };
          accessLogsDb.push(newEntry);
          return { ...newEntry };
        },
        findMany: async (args?: {
          where?: any;
          skip?: number;
          take?: number;
          orderBy?: { timestamp?: 'asc' | 'desc' };
        }) => {
          let filtered = [...accessLogsDb];

          if (args?.where) {
            if (args.where.petId) {
              filtered = filtered.filter((item) => item.petId === args.where.petId);
            }
            if (args.where.clinicId) {
              filtered = filtered.filter((item) => item.clinicId === args.where.clinicId);
            }
            if (args.where.userId) {
              filtered = filtered.filter((item) => item.userId === args.where.userId);
            }
            if (args.where.action) {
              filtered = filtered.filter((item) => item.action === args.where.action);
            }
          }

          if (args?.orderBy?.timestamp === 'desc') {
            filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          } else if (args?.orderBy?.timestamp === 'asc') {
            filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          }

          const skip = args?.skip ?? 0;
          const take = args?.take ?? filtered.length;

          return filtered.slice(skip, skip + take);
        },
        count: async (args?: { where?: any }) => {
          let filtered = [...accessLogsDb];

          if (args?.where) {
            if (args.where.petId) {
              filtered = filtered.filter((item) => item.petId === args.where.petId);
            }
            if (args.where.clinicId) {
              filtered = filtered.filter((item) => item.clinicId === args.where.clinicId);
            }
            if (args.where.userId) {
              filtered = filtered.filter((item) => item.userId === args.where.userId);
            }
            if (args.where.action) {
              filtered = filtered.filter((item) => item.action === args.where.action);
            }
          }

          return filtered.length;
        },
      },
    };

    accessLogsService = new AccessLogsService(mockPrisma as PrismaService);
    accessLogsController = new AccessLogsController(accessLogsService);
  });

  describe('a) Registro atómico de trazas en access_logs (RF-25)', () => {
    it('debe registrar una traza consignando petId, userId, clinicId, action, ipAddress, userAgent y timestamp', async () => {
      const createDto: CreateAccessLogDto = {
        petId: validPetId,
        clinicId: validClinicId,
        userId: validUserId,
        action: AccessAction.NFC_SCAN,
        ipAddress: '192.168.1.50',
        userAgent: 'VetApp-Desktop/1.0',
      };

      const result = await accessLogsService.log(createDto);

      assert.ok(result);
      assert.strictEqual(result.petId, validPetId);
      assert.strictEqual(result.clinicId, validClinicId);
      assert.strictEqual(result.userId, validUserId);
      assert.strictEqual(result.action, AccessAction.NFC_SCAN);
      assert.strictEqual(result.ipAddress, '192.168.1.50');
      assert.strictEqual(result.userAgent, 'VetApp-Desktop/1.0');
      assert.ok(result.timestamp instanceof Date);
      assert.ok(result.id);
    });

    it('debe registrar acciones MANUAL_LOOKUP y HISTORY_VIEW correctamente', async () => {
      const manualLookup = await accessLogsService.log({
        petId: validPetId,
        clinicId: validClinicId,
        userId: validUserId,
        action: AccessAction.MANUAL_LOOKUP,
      });
      assert.strictEqual(manualLookup.action, AccessAction.MANUAL_LOOKUP);

      const historyView = await accessLogsService.log({
        petId: validPetId,
        clinicId: validClinicId,
        userId: validUserId,
        action: AccessAction.HISTORY_VIEW,
      });
      assert.strictEqual(historyView.action, AccessAction.HISTORY_VIEW);
    });
  });

  describe('b) Registro exitoso de accesos de emergencia (RF-37)', () => {
    it('debe permitir clinicId y userId nulos con acción EMERGENCY_SCAN e IP pública', async () => {
      const emergencyDto: CreateAccessLogDto = {
        petId: validPetId,
        clinicId: null,
        userId: null,
        action: AccessAction.EMERGENCY_SCAN,
        ipAddress: '186.42.112.5',
        userAgent: 'Mozilla/5.0 iPhone',
      };

      const result = await accessLogsService.log(emergencyDto);

      assert.ok(result);
      assert.strictEqual(result.petId, validPetId);
      assert.strictEqual(result.clinicId, null);
      assert.strictEqual(result.userId, null);
      assert.strictEqual(result.action, AccessAction.EMERGENCY_SCAN);
      assert.strictEqual(result.ipAddress, '186.42.112.5');
      assert.strictEqual(result.userAgent, 'Mozilla/5.0 iPhone');
      assert.ok(result.timestamp instanceof Date);
    });

    it('debe manejar clinicId y userId no provistos (undefined) mapeándolos a null', async () => {
      const emergencyDto: CreateAccessLogDto = {
        petId: validPetId,
        action: AccessAction.EMERGENCY_SCAN,
        ipAddress: '186.42.112.9',
      };

      const result = await accessLogsService.log(emergencyDto);

      assert.ok(result);
      assert.strictEqual(result.clinicId, null);
      assert.strictEqual(result.userId, null);
      assert.strictEqual(result.userAgent, null);
      assert.strictEqual(result.action, AccessAction.EMERGENCY_SCAN);
    });
  });

  describe('c) Inmutabilidad estricta de trazas (RNF-7)', () => {
    it('AccessLogsService no debe contener métodos update, delete, remove, patch ni softDelete', () => {
      const prototype = Object.getPrototypeOf(accessLogsService);
      const prohibitedMethods = [
        'update',
        'updateMany',
        'delete',
        'deleteMany',
        'remove',
        'softDelete',
        'patch',
        'truncate',
        'drop',
      ];

      for (const method of prohibitedMethods) {
        assert.strictEqual(
          (accessLogsService as any)[method],
          undefined,
          `El método mutador '${method}' NO debe existir en AccessLogsService (RNF-7)`,
        );
        assert.strictEqual(
          prototype[method],
          undefined,
          `El método mutador '${method}' NO debe existir en el prototype de AccessLogsService (RNF-7)`,
        );
      }
    });
  });

  describe('d) Consulta paginada y filtrado de trazas con ordenación descendente', () => {
    it('findAll debe retornar estructura uniforme { data, meta } ordenada por timestamp desc', async () => {
      const result = await accessLogsService.findAll({ page: 1, limit: 10 });

      assert.ok(result.data);
      assert.ok(result.meta);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 10);
      assert.strictEqual(result.meta.total, 3);
      assert.strictEqual(result.meta.totalPages, 1);
      assert.strictEqual(result.meta.hasNextPage, false);
      assert.strictEqual(result.meta.hasPrevPage, false);

      // Verificación de orden descendente por timestamp
      for (let i = 0; i < result.data.length - 1; i++) {
        assert.ok(
          result.data[i].timestamp.getTime() >= result.data[i + 1].timestamp.getTime(),
          'Los logs deben estar ordenados cronológicamente en orden descendente',
        );
      }
    });

    it('findAll debe permitir filtrar por action', async () => {
      const result = await accessLogsService.findAll({ action: AccessAction.EMERGENCY_SCAN });
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].action, AccessAction.EMERGENCY_SCAN);
    });

    it('findAll debe permitir filtrar por clinicId', async () => {
      const result = await accessLogsService.findAll({ clinicId: validClinicId });
      assert.strictEqual(result.data.length, 2);
      result.data.forEach((log: MockAccessLog) => assert.strictEqual(log.clinicId, validClinicId));
    });

    it('findAll debe permitir filtrar por userId', async () => {
      const result = await accessLogsService.findAll({ userId: validUserId });
      assert.strictEqual(result.data.length, 2);
      result.data.forEach((log: MockAccessLog) => assert.strictEqual(log.userId, validUserId));
    });

    it('findByPetId debe retornar el historial cronológico de la mascota paginado', async () => {
      const result = await accessLogsService.findByPetId(validPetId, 1, 5);

      assert.ok(result.data);
      assert.strictEqual(result.meta.total, 3);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 5);
      result.data.forEach((log: MockAccessLog) => assert.strictEqual(log.petId, validPetId));
    });

    it('findByPetId con una mascota inexistente debe retornar lista vacía con total 0', async () => {
      const nonExistentPetId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const result = await accessLogsService.findByPetId(nonExistentPetId);

      assert.strictEqual(result.data.length, 0);
      assert.strictEqual(result.meta.total, 0);
    });
  });

  describe('e) AccessLogsController: Control de roles RBAC y delegación', () => {
    const reflector = new Reflector();

    it('GET /audit/access-logs debe tener @Roles(ADMIN)', () => {
      const roles = reflector.get<Role[]>(ROLES_KEY, AccessLogsController.prototype.findAll);
      assert.deepStrictEqual(roles, [Role.ADMIN]);
    });

    it('GET /audit/access-logs/pet/:petId debe tener @Roles(ADMIN, VET)', () => {
      const roles = reflector.get<Role[]>(ROLES_KEY, AccessLogsController.prototype.findByPetId);
      assert.deepStrictEqual(roles, [Role.ADMIN, Role.VET]);
    });

    it('findAll en controlador debe delegar a service.findAll()', async () => {
      const query: QueryAccessLogDto = { page: 1, limit: 10 };
      const response = await accessLogsController.findAll(validClinicId, query);
      assert.strictEqual(response.meta.total, 2);
    });

    it('findByPetId en controlador debe delegar a service.findByPetId()', async () => {
      const response = await accessLogsController.findByPetId(validPetId, 1, 10);
      assert.strictEqual(response.meta.total, 3);
      assert.strictEqual(response.data[0].petId, validPetId);
    });
  });

  describe('f) Validación sintáctica de DTOs con class-validator', () => {
    describe('CreateAccessLogDto', () => {
      it('debe validar un DTO de creación correcto con todos los campos', async () => {
        const dto = plainToInstance(CreateAccessLogDto, {
          petId: validPetId,
          clinicId: validClinicId,
          userId: validUserId,
          action: AccessAction.NFC_SCAN,
          ipAddress: '192.168.1.1',
          userAgent: 'TestAgent/1.0',
        });
        const errors = await validate(dto);
        assert.strictEqual(errors.length, 0);
      });

      it('debe validar un DTO de emergencia sin clinicId ni userId', async () => {
        const dto = plainToInstance(CreateAccessLogDto, {
          petId: validPetId,
          action: AccessAction.EMERGENCY_SCAN,
          ipAddress: '200.1.2.3',
        });
        const errors = await validate(dto);
        assert.strictEqual(errors.length, 0);
      });

      it('debe rechazar si petId no es un UUID válido', async () => {
        const dto = plainToInstance(CreateAccessLogDto, {
          petId: 'not-a-uuid',
          action: AccessAction.NFC_SCAN,
        });
        const errors = await validate(dto);
        assert.ok(errors.some((e) => e.property === 'petId'));
      });

      it('debe rechazar si action es inválida', async () => {
        const dto = plainToInstance(CreateAccessLogDto, {
          petId: validPetId,
          action: 'INVALID_ACTION',
        });
        const errors = await validate(dto);
        assert.ok(errors.some((e) => e.property === 'action'));
      });

      it('debe rechazar si clinicId no es un UUID cuando está provisto', async () => {
        const dto = plainToInstance(CreateAccessLogDto, {
          petId: validPetId,
          clinicId: 'bad-clinic-uuid',
          action: AccessAction.NFC_SCAN,
        });
        const errors = await validate(dto);
        assert.ok(errors.some((e) => e.property === 'clinicId'));
      });
    });

    describe('QueryAccessLogDto', () => {
      it('debe validar un DTO de consulta vacío con valores por defecto', async () => {
        const dto = plainToInstance(QueryAccessLogDto, {});
        const errors = await validate(dto);
        assert.strictEqual(errors.length, 0);
      });

      it('debe validar un DTO de consulta con filtros válidos', async () => {
        const dto = plainToInstance(QueryAccessLogDto, {
          petId: validPetId,
          clinicId: validClinicId,
          userId: validUserId,
          action: AccessAction.HISTORY_VIEW,
          page: 2,
          limit: 25,
        });
        const errors = await validate(dto);
        assert.strictEqual(errors.length, 0);
      });

      it('debe rechazar página menor a 1 o límite mayor a 100', async () => {
        const dto = plainToInstance(QueryAccessLogDto, {
          page: 0,
          limit: 150,
        });
        const errors = await validate(dto);
        assert.ok(errors.some((e) => e.property === 'page'));
        assert.ok(errors.some((e) => e.property === 'limit'));
      });
    });
  });
});
