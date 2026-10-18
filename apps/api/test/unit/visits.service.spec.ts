import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role, VisitStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { VisitsService } from '../../src/modules/visits/visits.service';
import { VisitsController } from '../../src/modules/visits/visits.controller';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';
import { CreateVisitDto } from '../../src/modules/visits/dto/create-visit.dto';

interface MockPet {
  id: string;
  name: string;
  deletedAt: Date | null;
}

interface MockVet {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MockVisit {
  id: string;
  clinicId: string;
  vetId: string;
  petId: string;
  reason: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: VisitStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pet?: MockPet;
  veterinarian?: MockVet;
}

describe('VisitsService & VisitsController (T18 / RF-39, RF-40)', () => {
  let visitsService: VisitsService;
  let visitsController: VisitsController;
  let collisionValidator: CollisionValidator;

  const validClinicId = '11111111-1111-4111-8111-111111111111';
  const validPetId = '22222222-2222-4222-8222-222222222222';
  const validVetId = '33333333-3333-4333-8333-333333333333';
  const validVisitId = '44444444-4444-4444-8444-444444444444';

  let mockPets: MockPet[];
  let mockUsers: MockVet[];
  let mockVisits: MockVisit[];

  let mockPrisma: any;

  beforeEach(() => {
    mockPets = [
      {
        id: validPetId,
        name: 'Firulais',
        deletedAt: null,
      },
      {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Mascota Inactiva',
        deletedAt: new Date(),
      },
    ];

    mockUsers = [
      {
        id: validVetId,
        name: 'Dra. María Veterinario',
        role: Role.VET,
        isActive: true,
        deletedAt: null,
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Veterinario Inactivo',
        role: Role.VET,
        isActive: false,
        deletedAt: new Date(),
      },
    ];

    mockVisits = [
      {
        id: validVisitId,
        clinicId: validClinicId,
        vetId: validVetId,
        petId: validPetId,
        reason: 'Vacunación anual séxtuple',
        scheduledDate: new Date('2026-10-25T10:00:00.000Z'),
        durationMinutes: 30,
        status: VisitStatus.SCHEDULED,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma = {
      pet: {
        findFirst: async ({ where }: any) => {
          return (
            mockPets.find((p) => {
              if (where.id && p.id !== where.id) return false;
              if (where.deletedAt === null && p.deletedAt !== null) return false;
              return true;
            }) ?? null
          );
        },
      },
      user: {
        findFirst: async ({ where }: any) => {
          return (
            mockUsers.find((u) => {
              if (where.id && u.id !== where.id) return false;
              if (where.deletedAt === null && u.deletedAt !== null) return false;
              if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
              return true;
            }) ?? null
          );
        },
      },
      visit: {
        findMany: async ({ where, skip, take }: any) => {
          let results = mockVisits.filter((v) => {
            if (where?.clinicId && v.clinicId !== where.clinicId) return false;
            if (where?.vetId && v.vetId !== where.vetId) return false;
            if (where?.petId && v.petId !== where.petId) return false;
            if (where?.deletedAt === null && v.deletedAt !== null) return false;
            if (where?.status?.in && !where.status.in.includes(v.status)) return false;
            return true;
          });
          if (skip !== undefined && take !== undefined) {
            results = results.slice(skip, skip + take);
          }
          return results;
        },
        count: async ({ where }: any) => {
          return mockVisits.filter((v) => {
            if (where?.clinicId && v.clinicId !== where.clinicId) return false;
            if (where?.deletedAt === null && v.deletedAt !== null) return false;
            return true;
          }).length;
        },
        findFirst: async ({ where }: any) => {
          return (
            mockVisits.find((v) => {
              if (where.id && v.id !== where.id) return false;
              if (where.deletedAt === null && v.deletedAt !== null) return false;
              return true;
            }) ?? null
          );
        },
        create: async ({ data }: any) => {
          const newVisit: MockVisit = {
            id: '55555555-5555-4555-8555-555555555555',
            clinicId: data.clinicId,
            vetId: data.vetId,
            petId: data.petId,
            reason: data.reason,
            scheduledDate: new Date(data.scheduledDate),
            durationMinutes: data.durationMinutes ?? 30,
            status: data.status ?? VisitStatus.SCHEDULED,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockVisits.push(newVisit);
          return newVisit;
        },
      },
    };

    collisionValidator = new CollisionValidator();
    visitsService = new VisitsService(mockPrisma, collisionValidator);
    visitsController = new VisitsController(visitsService);
  });

  describe('1. Agendamiento exitoso de visitas (RF-39)', () => {
    it('debe registrar exitosamente una visita con estado SCHEDULED por defecto', async () => {
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T11:00:00.000Z', // No colisiona con la de las 10:00 - 10:30
        durationMinutes: 45,
        reason: 'Control cardiológico semestral',
      };

      const result = await visitsService.scheduleVisit(validClinicId, dto);

      assert.ok(result);
      assert.strictEqual(result.clinicId, validClinicId);
      assert.strictEqual(result.vetId, validVetId);
      assert.strictEqual(result.petId, validPetId);
      assert.strictEqual(result.durationMinutes, 45);
      assert.strictEqual(result.reason, 'Control cardiológico semestral');
      assert.strictEqual(result.status, VisitStatus.SCHEDULED);
    });

    it('debe registrar con duración por defecto de 30 minutos si durationMinutes no se suministra', async () => {
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T12:00:00.000Z',
        reason: 'Consulta general por vómitos leves',
      };

      const result = await visitsService.scheduleVisit(validClinicId, dto);

      assert.strictEqual(result.durationMinutes, 30);
      assert.strictEqual(result.status, VisitStatus.SCHEDULED);
    });

    it('debe permitir agendar en estado PENDING si se envía explícitamente en el DTO', async () => {
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T14:00:00.000Z',
        reason: 'Ecografía abdominal programada',
        status: VisitStatus.PENDING,
      };

      const result = await visitsService.scheduleVisit(validClinicId, dto);

      assert.strictEqual(result.status, VisitStatus.PENDING);
    });
  });

  describe('2. Prevención algorítmica de solapamiento de horarios (RF-40)', () => {
    it('debe lanzar ConflictException (HTTP 409) cuando el intervalo solapa con una cita existente', async () => {
      // Visita existente: 2026-10-25T10:00:00.000Z a 10:30:00.000Z
      // Intentamos agendar a las 10:15:00.000Z por 30 minutos (10:15 - 10:45)
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:15:00.000Z',
        durationMinutes: 30,
        reason: 'Limpieza dental y revisión de encías',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, dto);
        },
        (error: any) => {
          assert.ok(error instanceof ConflictException);
          assert.strictEqual(error.getStatus(), 409);
          assert.match(
            error.message,
            /solapamiento de horario con otra cita programada/i,
          );
          return true;
        },
      );
    });

    it('debe permitir agendamiento si el horario finaliza exactamente al iniciar la otra (10:00:00)', async () => {
      // Nueva visita: 09:30 a 10:00 (termina justo cuando inicia la de las 10:00)
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T09:30:00.000Z',
        durationMinutes: 30,
        reason: 'Aplicación rápida de pipeta antipulgas',
      };

      const result = await visitsService.scheduleVisit(validClinicId, dto);
      assert.ok(result);
      assert.strictEqual(result.reason, 'Aplicación rápida de pipeta antipulgas');
    });

    it('debe permitir agendamiento si el horario inicia exactamente al finalizar la otra (10:30:00)', async () => {
      // Nueva visita: 10:30 a 11:00 (inicia justo cuando termina la de las 10:00)
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:30:00.000Z',
        durationMinutes: 30,
        reason: 'Extracción de puntos de sutura',
      };

      const result = await visitsService.scheduleVisit(validClinicId, dto);
      assert.ok(result);
      assert.strictEqual(result.reason, 'Extracción de puntos de sutura');
    });
  });

  describe('3. Validaciones de existencia e integridad (HTTP 404)', () => {
    it('debe lanzar NotFoundException si la mascota no existe', async () => {
      const dto: CreateVisitDto = {
        petId: '00000000-0000-4000-8000-000000000000',
        vetId: validVetId,
        scheduledDate: '2026-10-25T16:00:00.000Z',
        reason: 'Chequeo general de rutina',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, dto);
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          assert.strictEqual(error.getStatus(), 404);
          assert.match(error.message, /Mascota no encontrada o inactiva/i);
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si la mascota tiene borrado lógico (inactiva)', async () => {
      const dto: CreateVisitDto = {
        petId: '99999999-9999-4999-8999-999999999999',
        vetId: validVetId,
        scheduledDate: '2026-10-25T16:00:00.000Z',
        reason: 'Chequeo general de rutina',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, dto);
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          assert.strictEqual(error.getStatus(), 404);
          assert.match(error.message, /Mascota no encontrada o inactiva/i);
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el veterinario no existe', async () => {
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: '00000000-0000-4000-8000-000000000000',
        scheduledDate: '2026-10-25T16:00:00.000Z',
        reason: 'Chequeo general de rutina',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, dto);
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          assert.strictEqual(error.getStatus(), 404);
          assert.match(error.message, /Veterinario no encontrado o inactivo/i);
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el veterinario está inactivo', async () => {
      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: '88888888-8888-4888-8888-888888888888',
        scheduledDate: '2026-10-25T16:00:00.000Z',
        reason: 'Chequeo general de rutina',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, dto);
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          assert.strictEqual(error.getStatus(), 404);
          assert.match(error.message, /Veterinario no encontrado o inactivo/i);
          return true;
        },
      );
    });
  });

  describe('4. Consulta de visitas (findAll & findById)', () => {
    it('findAll debe retornar lista paginada de visitas de la clínica', async () => {
      const result = await visitsService.findAll(validClinicId, { page: 1, limit: 10 });
      assert.ok(result);
      assert.strictEqual(Array.isArray(result.data), true);
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.meta.page, 1);
    });

    it('findById debe retornar el detalle de una visita existente', async () => {
      const visit = await visitsService.findById(validVisitId);
      assert.ok(visit);
      assert.strictEqual(visit.id, validVisitId);
      assert.strictEqual(visit.reason, 'Vacunación anual séxtuple');
    });

    it('findById debe lanzar NotFoundException ante visita inexistente', async () => {
      await assert.rejects(
        async () => {
          await visitsService.findById('00000000-0000-4000-8000-000000000000');
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('5. Validación de DTOs con class-validator (CreateVisitDto)', () => {
    it('debe ser válido con todos los atributos correctos', async () => {
      const dto = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        durationMinutes: 45,
        reason: 'Revisión oftalmológica',
        status: VisitStatus.SCHEDULED,
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('debe fallar si petId no es UUID v4', async () => {
      const dto = plainToInstance(CreateVisitDto, {
        petId: 'not-a-uuid',
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        reason: 'Revisión oftalmológica',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'petId'));
    });

    it('debe fallar si vetId no es UUID v4', async () => {
      const dto = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: 'invalid-vet-id',
        scheduledDate: '2026-10-25T10:00:00.000Z',
        reason: 'Revisión oftalmológica',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'vetId'));
    });

    it('debe fallar si scheduledDate no es fecha ISO válida', async () => {
      const dto = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: 'fecha-invalida',
        reason: 'Revisión oftalmológica',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'scheduledDate'));
    });

    it('debe fallar si durationMinutes es menor a 15 o mayor a 120 (RF-39)', async () => {
      const dtoTooShort = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        durationMinutes: 10,
        reason: 'Revisión oftalmológica',
      });
      const errorsShort = await validate(dtoTooShort);
      assert.ok(errorsShort.some((e) => e.property === 'durationMinutes'));

      const dtoTooLong = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        durationMinutes: 150,
        reason: 'Revisión oftalmológica',
      });
      const errorsLong = await validate(dtoTooLong);
      assert.ok(errorsLong.some((e) => e.property === 'durationMinutes'));
    });

    it('debe fallar si reason tiene menos de 3 o más de 255 caracteres o está vacío (RF-39)', async () => {
      const dtoEmpty = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        reason: '',
      });
      const errorsEmpty = await validate(dtoEmpty);
      assert.ok(errorsEmpty.some((e) => e.property === 'reason'));

      const dtoShort = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        reason: 'ab',
      });
      const errorsShort = await validate(dtoShort);
      assert.ok(errorsShort.some((e) => e.property === 'reason'));

      const dtoLong = plainToInstance(CreateVisitDto, {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        reason: 'a'.repeat(256),
      });
      const errorsLong = await validate(dtoLong);
      assert.ok(errorsLong.some((e) => e.property === 'reason'));
    });
  });

  describe('6. Integración de VisitsController con RBAC y Guards', () => {
    it('VisitsController debe tener JwtAuthGuard y RolesGuard a nivel clase', () => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, VisitsController) ?? []) as unknown[];
      assert.ok(guards.length > 0, 'VisitsController debe tener guardias asignados');
      assert.ok(
        guards.includes(JwtAuthGuard),
        'VisitsController debe incluir JwtAuthGuard',
      );
      assert.ok(
        guards.includes(RolesGuard),
        'VisitsController debe incluir RolesGuard',
      );
    });

    it('POST /visits debe tener roles RECEPTION, ADMIN y VET y delegar con clinicId inyectado', async () => {
      const roles = (Reflect.getMetadata(ROLES_KEY, VisitsController.prototype.create) ?? []) as Role[];
      assert.ok(roles.length > 0, 'create debe tener roles asignados');
      assert.ok(roles.includes(Role.RECEPTION), 'debe permitir rol RECEPTION');
      assert.ok(roles.includes(Role.ADMIN), 'debe permitir rol ADMIN');
      assert.ok(roles.includes(Role.VET), 'debe permitir rol VET');

      const dto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T17:00:00.000Z',
        durationMinutes: 30,
        reason: 'Revisión por alergia cutánea',
      };

      const result = await visitsController.create(validClinicId, dto);
      assert.ok(result);
      assert.strictEqual(result.clinicId, validClinicId);
      assert.strictEqual(result.reason, 'Revisión por alergia cutánea');
    });

    it('GET /visits debe delegar a findAll con clinicId', async () => {
      const result = await visitsController.findAll(validClinicId, {});
      assert.ok(result);
      assert.strictEqual(result.meta.total, 1);
    });

    it('GET /visits/:id debe delegar a findById con id', async () => {
      const result = await visitsController.findById(validVisitId);
      assert.ok(result);
      assert.strictEqual(result.id, validVisitId);
    });
  });
});
