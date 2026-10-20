import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccessAction, GrantScope, GrantSource, Role, TagStatus } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccessLogsService } from '../../src/modules/audit/access-logs.service';
import { AccessGrantsService } from '../../src/modules/pets/access-grants.service';
import { TagsService } from '../../src/modules/tags/tags.service';
import { TagsController } from '../../src/modules/tags/tags.controller';
import { AssignTagDto } from '../../src/modules/tags/dto/assign-tag.dto';
import { ReportTagStatusDto } from '../../src/modules/tags/dto/report-tag-status.dto';

interface MockPet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  deletedAt: Date | null;
  ownerId: string;
  owner?: {
    id: string;
    name: string;
    lastName: string;
    phone: string;
  };
}

interface MockTag {
  id: string;
  uid: string;
  publicCode: string;
  status: TagStatus;
  petId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pet?: MockPet | null;
}

describe('TagsService & TagsController (T16 / RF-28, RF-29, RF-30, RF-31, RF-32, RF-56)', () => {
  let tagsService: TagsService;
  let tagsController: TagsController;
  let mockPrisma: any;
  let mockAccessLogsService: any;
  let mockAccessGrantsService: any;

  const sampleClinicId = 'clinic-uuid-1111-2222-3333-444455556666';
  const sampleUserId = 'user-uuid-1111-2222-3333-444455556666';
  const samplePetId = 'pet-uuid-aaaa-bbbb-cccc-dddd11112222';
  const sampleUid = '04A1B2C3D4E5F6';
  const sampleIp = '192.168.1.100';
  const sampleUserAgent = 'VetApp-Desktop/1.0';

  beforeEach(() => {
    mockPrisma = {
      tag: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async (args: any) => ({
          id: 'tag-uuid-created-1',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: async (args: any) => ({
          id: args.where.id,
          ...args.data,
          updatedAt: new Date(),
        }),
      },
      pet: {
        findFirst: async () => ({
          id: samplePetId,
          createdByClinicId: sampleClinicId,
          visits: [],
          deletedAt: null,
        }),
      },
      $transaction: async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        if (Array.isArray(cb)) {
          return Promise.all(cb);
        }
        return cb;
      },
    };

    mockAccessLogsService = {
      log: async (data: any) => ({
        id: 'access-log-uuid-1',
        ...data,
        timestamp: new Date(),
      }),
    };

    mockAccessGrantsService = {
      grantAccess: async (petId: string, clinicId: string, source: any, scope: any, duration: number) => ({
        id: 'access-grant-uuid-1',
        petId,
        clinicId,
        source,
        scope,
        durationHours: duration,
        expiresAt: new Date(Date.now() + duration * 3600 * 1000),
      }),
      hasActiveGrant: async () => true,
    };

    tagsService = new TagsService(
      mockPrisma as unknown as PrismaService,
      mockAccessLogsService as unknown as AccessLogsService,
      mockAccessGrantsService as unknown as AccessGrantsService,
    );

    tagsController = new TagsController(tagsService);
  });

  describe('1. Resolución transaccional de tags NFC (RF-28, RF-29, RF-56)', () => {
    it('debe resolver un tag activo, registrar traza en AccessLog, otorgar AccessGrant por 24h y retornar ficha con acceso completo (RF-28, RF-56)', async () => {
      let loggedData: any = null;
      let grantedData: any = null;

      mockAccessLogsService.log = async (data: any) => {
        loggedData = data;
        return { id: 'log-1', ...data, timestamp: new Date() };
      };

      mockAccessGrantsService.grantAccess = async (
        petId: string,
        clinicId: string,
        source: any,
        scope: any,
        duration: number,
      ) => {
        grantedData = { petId, clinicId, source, scope, duration };
        return {
          id: 'grant-1',
          petId,
          clinicId,
          source,
          scope,
          expiresAt: new Date(Date.now() + duration * 3600 * 1000),
        };
      };

      const existingTag: MockTag = {
        id: 'tag-uuid-1',
        uid: sampleUid,
        publicCode: 'pub-code-123',
        status: TagStatus.ACTIVE,
        petId: samplePetId,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        pet: {
          id: samplePetId,
          name: 'Firulais',
          species: 'CANINE',
          breed: 'Labrador',
          deletedAt: null,
          ownerId: 'owner-uuid-1',
          owner: {
            id: 'owner-uuid-1',
            name: 'Juan',
            lastName: 'Pérez',
            phone: '+593991234567',
          },
        },
      };

      mockPrisma.tag.findFirst = async () => existingTag;

      const result = await tagsService.resolveUid(
        sampleUid,
        sampleClinicId,
        sampleUserId,
        sampleIp,
        sampleUserAgent,
      );

      assert.strictEqual(result.registered, true);
      assert.strictEqual(result.uid, sampleUid);
      assert.strictEqual(result.hasFullAccess, true);
      assert.strictEqual(result.pet.id, samplePetId);
      assert.strictEqual(result.pet.name, 'Firulais');
      assert.ok(result.grant, 'Debe incluir el grant concedido');

      // Verificación de AccessLog (RF-28)
      assert.ok(loggedData, 'Debe invocar AccessLogsService.log');
      assert.strictEqual(loggedData.petId, samplePetId);
      assert.strictEqual(loggedData.clinicId, sampleClinicId);
      assert.strictEqual(loggedData.userId, sampleUserId);
      assert.strictEqual(loggedData.action, AccessAction.NFC_SCAN);
      assert.strictEqual(loggedData.ipAddress, sampleIp);
      assert.strictEqual(loggedData.userAgent, sampleUserAgent);

      // Verificación de AccessGrant (RF-28)
      assert.ok(grantedData, 'Debe invocar AccessGrantsService.grantAccess');
      assert.strictEqual(grantedData.petId, samplePetId);
      assert.strictEqual(grantedData.clinicId, sampleClinicId);
      assert.strictEqual(grantedData.source, GrantSource.NFC_TAP);
      assert.strictEqual(grantedData.scope, GrantScope.FULL_HISTORY);
      assert.strictEqual(grantedData.duration, 24);
    });

    it('debe lanzar NotFoundException con payload { registered: false, uid } si el tag no existe (RF-29)', async () => {
      mockPrisma.tag.findFirst = async () => null;

      try {
        await tagsService.resolveUid(sampleUid, sampleClinicId, sampleUserId);
        assert.fail('Debió lanzar NotFoundException');
      } catch (error) {
        assert.ok(error instanceof NotFoundException);
        const response: any = error.getResponse();
        assert.strictEqual(response.registered, false);
        assert.strictEqual(response.uid, sampleUid);
      }
    });

    it('debe lanzar NotFoundException con { registered: false, uid } si el tag no tiene mascota vinculada (RF-29)', async () => {
      mockPrisma.tag.findFirst = async () => ({
        id: 'tag-unassigned',
        uid: sampleUid,
        publicCode: 'pub-unassigned',
        status: TagStatus.ACTIVE,
        petId: null,
        deletedAt: null,
        pet: null,
      });

      try {
        await tagsService.resolveUid(sampleUid, sampleClinicId, sampleUserId);
        assert.fail('Debió lanzar NotFoundException');
      } catch (error) {
        assert.ok(error instanceof NotFoundException);
        const response: any = error.getResponse();
        assert.strictEqual(response.registered, false);
        assert.strictEqual(response.uid, sampleUid);
      }
    });

    it('debe lanzar NotFoundException con { registered: false, uid } si la mascota vinculada está eliminada lógicamente (RF-29)', async () => {
      mockPrisma.tag.findFirst = async () => ({
        id: 'tag-with-deleted-pet',
        uid: sampleUid,
        publicCode: 'pub-deleted-pet',
        status: TagStatus.ACTIVE,
        petId: samplePetId,
        deletedAt: null,
        pet: {
          id: samplePetId,
          name: 'Fantasma',
          deletedAt: new Date(),
        },
      });

      try {
        await tagsService.resolveUid(sampleUid, sampleClinicId, sampleUserId);
        assert.fail('Debió lanzar NotFoundException');
      } catch (error) {
        assert.ok(error instanceof NotFoundException);
        const response: any = error.getResponse();
        assert.strictEqual(response.registered, false);
        assert.strictEqual(response.uid, sampleUid);
      }
    });
  });

  describe('2. Asignación de tag NFC a una mascota (RF-30, RF-31)', () => {
    it('debe asignar exitosamente un tag a una mascota generando un publicCode único (RF-30)', async () => {
      mockPrisma.pet.findFirst = async () => ({
        id: samplePetId,
        name: 'Firulais',
        deletedAt: null,
      });

      // Ningún tag activo con ese UID ni para esa mascota
      mockPrisma.tag.findFirst = async () => null;

      let createdData: any = null;
      mockPrisma.tag.create = async (args: any) => {
        createdData = args.data;
        return {
          id: 'new-tag-id',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };

      const assignDto: AssignTagDto = {
        uid: sampleUid,
        petId: samplePetId,
      };

      const result = await tagsService.assignTag(assignDto);

      assert.strictEqual(result.uid, sampleUid);
      assert.strictEqual(result.petId, samplePetId);
      assert.strictEqual(result.status, TagStatus.ACTIVE);
      assert.ok(result.publicCode, 'Debe generar publicCode');
      assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.publicCode),
        'publicCode debe ser un UUID v4 válido',
      );
      assert.strictEqual(createdData.status, TagStatus.ACTIVE);
    });

    it('debe lanzar NotFoundException si la mascota no existe o está eliminada', async () => {
      mockPrisma.pet.findFirst = async () => null;

      const assignDto: AssignTagDto = {
        uid: sampleUid,
        petId: samplePetId,
      };

      await assert.rejects(
        async () => tagsService.assignTag(assignDto),
        (err: any) => err instanceof NotFoundException && err.message.includes('no encontrada'),
      );
    });

    it('debe rechazar con HTTP 409 Conflict si el UID físico ya se encuentra activo en el sistema (RF-31)', async () => {
      mockPrisma.pet.findFirst = async () => ({
        id: samplePetId,
        deletedAt: null,
      });

      // Primer findFirst de tag evalúa el UID
      mockPrisma.tag.findFirst = async (args: any) => {
        if (args.where.uid === sampleUid) {
          return {
            id: 'existing-tag-with-same-uid',
            uid: sampleUid,
            status: TagStatus.ACTIVE,
            deletedAt: null,
          };
        }
        return null;
      };

      const assignDto: AssignTagDto = {
        uid: sampleUid,
        petId: samplePetId,
      };

      await assert.rejects(
        async () => tagsService.assignTag(assignDto),
        (err: any) =>
          err instanceof ConflictException &&
          err.message.includes('El UID físico ya se encuentra activo en el sistema'),
      );
    });

    it('debe rechazar con HTTP 409 Conflict si la mascota ya cuenta con un tag activo asignado (RF-31)', async () => {
      mockPrisma.pet.findFirst = async () => ({
        id: samplePetId,
        deletedAt: null,
      });

      // Primer findFirst (uid) retorna null, segundo findFirst (petId) retorna tag activo
      mockPrisma.tag.findFirst = async (args: any) => {
        if (args.where.petId === samplePetId) {
          return {
            id: 'existing-tag-for-pet',
            uid: 'ANOTHER_UID',
            petId: samplePetId,
            status: TagStatus.ACTIVE,
            deletedAt: null,
          };
        }
        return null;
      };

      const assignDto: AssignTagDto = {
        uid: sampleUid,
        petId: samplePetId,
      };

      await assert.rejects(
        async () => tagsService.assignTag(assignDto),
        (err: any) =>
          err instanceof ConflictException &&
          err.message.includes('La mascota ya cuenta con un tag activo asignado'),
      );
    });
  });

  describe('3. Reporte de estado y trazabilidad histórica (RF-32)', () => {
    it('debe actualizar el estado del tag a LOST conservando el registro histórico (RF-32)', async () => {
      mockPrisma.tag.findFirst = async () => ({
        id: 'tag-1',
        uid: sampleUid,
        status: TagStatus.ACTIVE,
        petId: samplePetId,
        deletedAt: null,
        pet: {
          id: samplePetId,
          createdByClinicId: sampleClinicId,
          visits: [],
        },
      });

      let updatedData: any = null;
      mockPrisma.tag.update = async (args: any) => {
        updatedData = args;
        return {
          id: args.where.id,
          status: args.data.status,
          updatedAt: new Date(),
        };
      };

      const statusDto: ReportTagStatusDto = {
        status: TagStatus.LOST,
      };

      const result = await tagsService.reportStatus('tag-1', statusDto, sampleClinicId);

      assert.strictEqual(result.status, TagStatus.LOST);
      assert.strictEqual(updatedData.where.id, 'tag-1');
      assert.strictEqual(updatedData.data.status, TagStatus.LOST);
    });

    it('debe actualizar el estado del tag a DAMAGED (RF-32)', async () => {
      mockPrisma.tag.findFirst = async () => ({
        id: 'tag-1',
        uid: sampleUid,
        status: TagStatus.ACTIVE,
        petId: samplePetId,
        deletedAt: null,
        pet: {
          id: samplePetId,
          createdByClinicId: sampleClinicId,
          visits: [],
        },
      });

      mockPrisma.tag.update = async (args: any) => ({
        id: args.where.id,
        status: args.data.status,
      });

      const result = await tagsService.reportStatus('tag-1', {
        status: TagStatus.DAMAGED,
      }, sampleClinicId);

      assert.strictEqual(result.status, TagStatus.DAMAGED);
    });

    it('debe lanzar NotFoundException si el tag a actualizar no existe o está eliminado lógicamente', async () => {
      mockPrisma.tag.findFirst = async () => null;

      await assert.rejects(
        async () => tagsService.reportStatus('tag-inexistente', { status: TagStatus.LOST }, sampleClinicId),
        (err: any) => err instanceof NotFoundException && err.message.includes('no encontrado'),
      );
    });
  });

  describe('4. Consulta de tags de una mascota (findByPetId)', () => {
    it('debe retornar lista de tags de la mascota ordenados por createdAt desc', async () => {
      const mockTags: MockTag[] = [
        {
          id: 'tag-recent',
          uid: 'UID-2',
          publicCode: 'code-2',
          status: TagStatus.ACTIVE,
          petId: samplePetId,
          deletedAt: null,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
        },
        {
          id: 'tag-old',
          uid: 'UID-1',
          publicCode: 'code-1',
          status: TagStatus.LOST,
          petId: samplePetId,
          deletedAt: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];

      mockPrisma.tag.findMany = async (args: any) => {
        assert.strictEqual(args.where.petId, samplePetId);
        assert.strictEqual(args.where.deletedAt, null);
        assert.strictEqual(args.orderBy.createdAt, 'desc');
        return mockTags;
      };

      const result = await tagsService.findByPetId(samplePetId, sampleClinicId);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 'tag-recent');
      assert.strictEqual(result[1].id, 'tag-old');
    });
  });

  describe('5. Validación de DTOs con class-validator', () => {
    it('AssignTagDto: debe ser válido con uid no vacío y petId UUID válido', async () => {
      const dto = plainToInstance(AssignTagDto, {
        uid: '04A1B2C3D4',
        petId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('AssignTagDto: debe fallar si uid está vacío', async () => {
      const dto = plainToInstance(AssignTagDto, {
        uid: '',
        petId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'uid'));
    });

    it('AssignTagDto: debe fallar si petId no es un UUID válido', async () => {
      const dto = plainToInstance(AssignTagDto, {
        uid: '04A1B2C3D4',
        petId: 'not-a-uuid',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'petId'));
    });

    it('ReportTagStatusDto: debe ser válido con enum TagStatus permitido', async () => {
      const dto = plainToInstance(ReportTagStatusDto, {
        status: TagStatus.LOST,
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('ReportTagStatusDto: debe fallar con un status no permitido', async () => {
      const dto = plainToInstance(ReportTagStatusDto, {
        status: 'INVALID_STATUS',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'status'));
    });
  });

  describe('6. Integración de TagsController con RBAC y delegación al servicio', () => {
    it('GET /tags/resolve/:uid debe extraer clinicId y userId de request.user, ip y userAgent de request y delegar', async () => {
      let resolvedArgs: any = null;
      tagsService.resolveUid = async (uid, clinicId, userId, ip, ua) => {
        resolvedArgs = { uid, clinicId, userId, ip, ua };
        return {
          registered: true,
          uid,
          pet: { id: samplePetId } as any,
          hasFullAccess: true,
          grant: { id: 'grant-mock' } as any,
        };
      };

      const mockRequest: any = {
        user: {
          clinicId: sampleClinicId,
          userId: sampleUserId,
        },
        ip: sampleIp,
        headers: {
          'user-agent': sampleUserAgent,
        },
      };

      const res = await tagsController.resolve(sampleUid, mockRequest);
      assert.strictEqual(res.registered, true);
      assert.strictEqual(resolvedArgs.uid, sampleUid);
      assert.strictEqual(resolvedArgs.clinicId, sampleClinicId);
      assert.strictEqual(resolvedArgs.userId, sampleUserId);
      assert.strictEqual(resolvedArgs.ip, sampleIp);
      assert.strictEqual(resolvedArgs.ua, sampleUserAgent);
    });

    it('POST /tags/assign debe tener @Roles(Role.RECEPTION, Role.ADMIN) y delegar a assignTag', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, tagsController.assign);
      assert.ok(Array.isArray(roles), 'Debe tener roles asignados');
      assert.ok(roles.includes(Role.RECEPTION));
      assert.ok(roles.includes(Role.ADMIN));

      let assignedDto: any = null;
      tagsService.assignTag = async (dto) => {
        assignedDto = dto;
        return { id: 'tag-assigned-1', ...dto } as any;
      };

      const dto: AssignTagDto = { uid: sampleUid, petId: samplePetId };
      const res = await tagsController.assign(dto);
      assert.strictEqual(res.id, 'tag-assigned-1');
      assert.strictEqual(assignedDto.uid, sampleUid);
    });

    it('PATCH /tags/:id/status debe tener @Roles(Role.RECEPTION, Role.ADMIN) y delegar a reportStatus', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, tagsController.reportStatus);
      assert.ok(Array.isArray(roles), 'Debe tener roles asignados');
      assert.ok(roles.includes(Role.RECEPTION));
      assert.ok(roles.includes(Role.ADMIN));

      let reportedArgs: any = null;
      tagsService.reportStatus = async (id, dto, clinicId) => {
        reportedArgs = { id, dto, clinicId };
        return { id, status: dto.status } as any;
      };

      const dto: ReportTagStatusDto = { status: TagStatus.DAMAGED };
      const res = await tagsController.reportStatus(sampleClinicId, 'tag-123', dto);
      assert.strictEqual(res.status, TagStatus.DAMAGED);
      assert.strictEqual(reportedArgs.id, 'tag-123');
      assert.strictEqual(reportedArgs.clinicId, sampleClinicId);
    });

    it('GET /tags/pet/:petId debe delegar a findByPetId', async () => {
      let queriedPetId: string | null = null;
      let queriedClinicId: string | null = null;
      tagsService.findByPetId = async (petId, clinicId) => {
        queriedPetId = petId;
        queriedClinicId = clinicId;
        return [{ id: 'tag-1', petId }] as any;
      };

      const res = await tagsController.findByPetId(sampleClinicId, samplePetId);
      assert.strictEqual(res.length, 1);
      assert.strictEqual(queriedPetId, samplePetId);
      assert.strictEqual(queriedClinicId, sampleClinicId);
    });
  });
});
