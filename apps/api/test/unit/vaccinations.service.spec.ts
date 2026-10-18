import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GrantScope, Role } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { VaccinationsService } from '../../src/modules/vaccinations/vaccinations.service';
import { VaccinationsController } from '../../src/modules/vaccinations/vaccinations.controller';
import { CreateVaccinationDto } from '../../src/modules/vaccinations/dto/create-vaccination.dto';
import { QueryVaccinationDto } from '../../src/modules/vaccinations/dto/query-vaccination.dto';
import { AccessGrantsService } from '../../src/modules/pets/access-grants.service';

interface MockPet {
  id: string;
  name: string;
  species: string;
  breed: string;
  deletedAt: Date | null;
}

interface MockVet {
  id: string;
  name: string;
  email: string;
  role: Role;
  licenseNumber: string;
}

interface MockVaccination {
  id: string;
  petId: string;
  clinicId: string | null;
  vetId: string | null;
  vaccineName: string;
  batchNumber: string | null;
  appliedAt: Date;
  nextDueDate: Date | null;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pet?: MockPet;
  veterinarian?: MockVet;
}

describe('VaccinationsService & VaccinationsController - T22 (RF-48, RF-21, RNF-8)', () => {
  let vaccinationsService: VaccinationsService;
  let vaccinationsController: VaccinationsController;

  const validClinicId = '11111111-1111-4111-8111-111111111111';
  const otherClinicId = '99999999-9999-4999-8999-999999999999';
  const validPetId = '22222222-2222-4222-8222-222222222222';
  const inactivePetId = '33333333-3333-4333-8333-333333333333';
  const validVetId = '44444444-4444-4444-8444-444444444444';
  const vaccinationId = '55555555-5555-4555-8555-555555555555';

  let mockPets: MockPet[];
  let mockVaccinations: MockVaccination[];
  let mockVets: MockVet[];
  let mockPrisma: any;
  let mockAccessGrantsService: any;

  beforeEach(() => {
    mockPets = [
      {
        id: validPetId,
        name: 'Rocky',
        species: 'CANINE',
        breed: 'Golden Retriever',
        deletedAt: null,
      },
      {
        id: inactivePetId,
        name: 'Luna',
        species: 'FELINE',
        breed: 'Siames',
        deletedAt: new Date(),
      },
    ];

    mockVets = [
      {
        id: validVetId,
        name: 'Dr. John Doe',
        email: 'vet@clinic.com',
        role: Role.VET,
        licenseNumber: 'VET-12345',
      },
    ];

    mockVaccinations = [
      {
        id: vaccinationId,
        petId: validPetId,
        clinicId: validClinicId,
        vetId: validVetId,
        vaccineName: 'Rabia Felina/Canina Nobivac',
        batchNumber: 'LOTE-2026-X1',
        appliedAt: new Date('2026-03-01T10:00:00.000Z'),
        nextDueDate: new Date('2027-03-01T10:00:00.000Z'),
        notes: 'Aplicación sin reacciones adversas inmediatas',
        deletedAt: null,
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: new Date('2026-03-01T10:00:00.000Z'),
        pet: mockPets[0],
        veterinarian: mockVets[0],
      },
    ];

    mockPrisma = {
      pet: {
        findFirst: async (args: any) => {
          return (
            mockPets.find((p) => {
              if (args?.where?.id && p.id !== args.where.id) return false;
              if (args?.where?.deletedAt === null && p.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
      vaccination: {
        create: async (args: any) => {
          const newVac: MockVaccination = {
            id: '66666666-6666-4666-8666-666666666666',
            petId: args.data.petId,
            clinicId: args.data.clinicId,
            vetId: args.data.vetId,
            vaccineName: args.data.vaccineName,
            batchNumber: args.data.batchNumber ?? null,
            appliedAt: args.data.appliedAt,
            nextDueDate: args.data.nextDueDate ?? null,
            notes: args.data.notes ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            pet: mockPets.find((p) => p.id === args.data.petId),
            veterinarian: mockVets.find((v) => v.id === args.data.vetId),
          };
          mockVaccinations.push(newVac);
          return newVac;
        },
        findMany: async (args: any) => {
          let filtered = mockVaccinations.filter((v) => {
            if (args?.where?.deletedAt === null && v.deletedAt !== null) return false;
            if (args?.where?.petId && v.petId !== args.where.petId) return false;
            if (args?.where?.clinicId && v.clinicId !== args.where.clinicId) return false;
            return true;
          });

          // Sorting
          if (args?.orderBy?.appliedAt === 'desc') {
            filtered.sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
          }

          const skip = args?.skip || 0;
          const take = args?.take !== undefined ? args.take : filtered.length;
          return filtered.slice(skip, skip + take);
        },
        count: async (args: any) => {
          return mockVaccinations.filter((v) => {
            if (args?.where?.deletedAt === null && v.deletedAt !== null) return false;
            if (args?.where?.petId && v.petId !== args.where.petId) return false;
            if (args?.where?.clinicId && v.clinicId !== args.where.clinicId) return false;
            return true;
          }).length;
        },
        findFirst: async (args: any) => {
          return (
            mockVaccinations.find((v) => {
              if (args?.where?.id && v.id !== args.where.id) return false;
              if (args?.where?.clinicId && v.clinicId !== args.where.clinicId) return false;
              if (args?.where?.deletedAt === null && v.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
    };

    mockAccessGrantsService = {
      hasActiveGrant: async (petId: string, clinicId: string, requiredScope?: GrantScope) => {
        // En tests, configurado dinámicamente según la prueba
        return true;
      },
    };

    vaccinationsService = new VaccinationsService(mockPrisma as any, mockAccessGrantsService as any);
    vaccinationsController = new VaccinationsController(vaccinationsService);
  });

  describe('1. Registro exitoso de biológico (RF-48)', () => {
    it('debe registrar exitosamente una vacuna con todos sus campos y relacionar mascota y veterinario', async () => {
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: '  Séxtuple Canina Vanguard Plus  ',
        batchNumber: '  LOTE-2026-ABC  ',
        appliedAt: '2026-04-10T09:30:00.000Z',
        nextDueDate: '2027-04-10T09:30:00.000Z',
        notes: 'Refuerzo anual administrado sin complicaciones',
      };

      const result = await vaccinationsService.create(validClinicId, validVetId, createDto);

      assert.ok(result);
      assert.strictEqual(result.petId, validPetId);
      assert.strictEqual(result.clinicId, validClinicId);
      assert.strictEqual(result.vetId, validVetId);
      assert.strictEqual(result.vaccineName, 'Séxtuple Canina Vanguard Plus');
      assert.strictEqual(result.batchNumber, 'LOTE-2026-ABC');
      assert.strictEqual(result.notes, 'Refuerzo anual administrado sin complicaciones');
      assert.ok(result.pet);
      assert.strictEqual(result.pet?.name, 'Rocky');
      assert.ok(result.veterinarian);
      assert.strictEqual(result.veterinarian?.id, validVetId);
    });

    it('debe asignar la fecha actual por defecto a appliedAt si no es provista', async () => {
      const futureDueDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Antirrábica Anual',
        nextDueDate: futureDueDate,
      };

      const before = Date.now();
      const result = await vaccinationsService.create(validClinicId, validVetId, createDto);
      const after = Date.now();

      assert.ok(result.appliedAt instanceof Date);
      assert.ok(result.appliedAt.getTime() >= before - 1000 && result.appliedAt.getTime() <= after + 1000);
      assert.strictEqual(result.batchNumber, null);
    });

    it('debe permitir registrar una vacuna sin nextDueDate (opcional)', async () => {
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Dosis Única Especial',
      };

      const result = await vaccinationsService.create(validClinicId, validVetId, createDto);
      assert.strictEqual(result.nextDueDate, null);
    });
  });

  describe('2. Rechazo con HTTP 400 Bad Request si nextDueDate es anterior o igual a appliedAt', () => {
    it('debe lanzar BadRequestException si nextDueDate es cronológicamente anterior a appliedAt', async () => {
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Parvovirus Canino',
        appliedAt: '2026-05-15T10:00:00.000Z',
        nextDueDate: '2026-05-14T10:00:00.000Z',
      };

      await assert.rejects(
        async () => {
          await vaccinationsService.create(validClinicId, validVetId, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'La fecha del próximo refuerzo debe ser posterior a la fecha de aplicación',
          );
          return true;
        },
      );
    });

    it('debe lanzar BadRequestException si nextDueDate es idéntica a appliedAt', async () => {
      const sameDate = '2026-06-01T12:00:00.000Z';
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Antirrábica Felina',
        appliedAt: sameDate,
        nextDueDate: sameDate,
      };

      await assert.rejects(
        async () => {
          await vaccinationsService.create(validClinicId, validVetId, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'La fecha del próximo refuerzo debe ser posterior a la fecha de aplicación',
          );
          return true;
        },
      );
    });

    it('debe lanzar BadRequestException si appliedAt no se especifica y nextDueDate es anterior a la fecha actual', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Desparasitación Triple',
        nextDueDate: pastDate,
      };

      await assert.rejects(
        async () => {
          await vaccinationsService.create(validClinicId, validVetId, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'La fecha del próximo refuerzo debe ser posterior a la fecha de aplicación',
          );
          return true;
        },
      );
    });
  });

  describe('3. Rechazo con HTTP 404 Not Found si la mascota no existe o está inactiva', () => {
    it('debe lanzar NotFoundException si la mascota no existe en la base de datos', async () => {
      const nonExistentPetId = '99999999-0000-4000-8000-000000000000';
      const createDto: CreateVaccinationDto = {
        petId: nonExistentPetId,
        vaccineName: 'Triple Felina Nobivac',
      };

      await assert.rejects(
        async () => {
          await vaccinationsService.create(validClinicId, validVetId, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si la mascota posee borrado lógico (deletedAt no nulo)', async () => {
      const createDto: CreateVaccinationDto = {
        petId: inactivePetId,
        vaccineName: 'Vacuna Giardia',
      };

      await assert.rejects(
        async () => {
          await vaccinationsService.create(validClinicId, validVetId, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });
  });

  describe('4. Consulta de vacunaciones por mascota protegida por AccessGrant vigente (RF-48, RNF-8)', () => {
    it('debe retornar lista paginada ordenada descendentemente por appliedAt cuando el grant está activo', async () => {
      mockAccessGrantsService.hasActiveGrant = async (petId: string, clinicId: string, scope?: GrantScope) => {
        assert.strictEqual(petId, validPetId);
        assert.strictEqual(clinicId, validClinicId);
        assert.strictEqual(scope, GrantScope.VACCINES_ONLY);
        return true;
      };

      const result = await vaccinationsService.findByPetId(validPetId, validClinicId, 1, 10);

      assert.ok(result);
      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 10);
      assert.strictEqual(result.meta.totalPages, 1);
      assert.strictEqual(result.meta.hasNextPage, false);
      assert.strictEqual(result.meta.hasPrevPage, false);
      assert.strictEqual(result.data[0].id, vaccinationId);
    });
  });

  describe('5. Bloqueo determinista con HTTP 403 Forbidden al consultar sin AccessGrant activo (RF-21, RF-48, RNF-8)', () => {
    it('debe lanzar ForbiddenException si AccessGrantsService.hasActiveGrant retorna false', async () => {
      mockAccessGrantsService.hasActiveGrant = async () => false;

      await assert.rejects(
        async () => {
          await vaccinationsService.findByPetId(validPetId, otherClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar las vacunaciones de este paciente',
          );
          return true;
        },
      );
    });
  });

  describe('6. Consultas generales findAll y findById en VaccinationsService', () => {
    it('findAll debe listar vacunaciones de la clínica con paginación', async () => {
      const queryDto: QueryVaccinationDto = { page: 1, limit: 5 };
      const result = await vaccinationsService.findAll(validClinicId, queryDto);

      assert.ok(result);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 5);
      assert.strictEqual(result.data[0].clinicId, validClinicId);
    });

    it('findById debe retornar la vacunación si existe', async () => {
      const result = await vaccinationsService.findById(vaccinationId, validClinicId);
      assert.ok(result);
      assert.strictEqual(result.id, vaccinationId);
    });

    it('findById debe lanzar NotFoundException si no existe o no corresponde a la clínica', async () => {
      await assert.rejects(
        async () => {
          await vaccinationsService.findById('00000000-0000-0000-0000-000000000000', validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('7. VaccinationsController: autorización y delegación', () => {
    it('POST /vaccinations debe tener rol VET y delegar a vaccinationsService.create', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VaccinationsController.prototype.create);
      assert.deepStrictEqual(roles, [Role.VET]);

      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Puppy DP',
      };

      const fakeReq: any = {
        user: {
          id: validVetId,
          clinicId: validClinicId,
        },
      };

      const res = await vaccinationsController.create(validClinicId, fakeReq, createDto);
      assert.ok(res);
      assert.strictEqual(res.petId, validPetId);
    });

    it('POST /vaccinations debe lanzar UnauthorizedException si no hay usuario en sesión', async () => {
      const createDto: CreateVaccinationDto = {
        petId: validPetId,
        vaccineName: 'Puppy DP',
      };

      const fakeReq: any = {};

      await assert.rejects(
        async () => {
          await vaccinationsController.create(validClinicId, fakeReq, createDto);
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          return true;
        },
      );
    });

    it('GET /vaccinations/pet/:petId debe tener roles VET y ADMIN y delegar a findByPetId', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VaccinationsController.prototype.findByPetId);
      assert.deepStrictEqual(roles, [Role.VET, Role.ADMIN]);

      const res = await vaccinationsController.findByPetId(validClinicId, validPetId, 1, 10);
      assert.ok(res);
      assert.strictEqual(res.data.length, 1);
    });

    it('GET /vaccinations debe delegar a findAll', async () => {
      const res = await vaccinationsController.findAll(validClinicId, { page: 1, limit: 10 });
      assert.ok(res);
      assert.strictEqual(res.meta.total, 1);
    });

    it('GET /vaccinations/:id debe delegar a findById', async () => {
      const res = await vaccinationsController.findById(validClinicId, vaccinationId);
      assert.ok(res);
      assert.strictEqual(res.id, vaccinationId);
    });
  });

  describe('8. Validación sintáctica de DTOs con class-validator (RF-48)', () => {
    it('CreateVaccinationDto debe ser válido con parámetros mínimos obligatorios', async () => {
      const dto = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
        vaccineName: 'Rabia',
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('CreateVaccinationDto debe ser válido con todos sus atributos completos', async () => {
      const dto = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
        vaccineName: 'Nobivac DHPPi',
        batchNumber: 'BATCH-2026-99',
        appliedAt: '2026-10-18T10:00:00.000Z',
        nextDueDate: '2027-10-18T10:00:00.000Z',
        notes: 'Ninguna reacción',
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('CreateVaccinationDto debe fallar si petId no es UUID v4', async () => {
      const dto = plainToInstance(CreateVaccinationDto, {
        petId: 'invalid-uuid',
        vaccineName: 'Rabia',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'petId'));
    });

    it('CreateVaccinationDto debe fallar si vaccineName tiene menos de 2 caracteres o está ausente', async () => {
      const dtoEmpty = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
      });

      const errorsEmpty = await validate(dtoEmpty);
      assert.ok(errorsEmpty.some((e) => e.property === 'vaccineName'));

      const dtoShort = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
        vaccineName: 'A',
      });

      const errorsShort = await validate(dtoShort);
      assert.ok(errorsShort.some((e) => e.property === 'vaccineName'));
    });

    it('CreateVaccinationDto debe fallar si batchNumber supera 50 caracteres', async () => {
      const dto = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
        vaccineName: 'Rabia',
        batchNumber: 'A'.repeat(51),
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'batchNumber'));
    });

    it('CreateVaccinationDto debe fallar si appliedAt o nextDueDate no son fechas ISO', async () => {
      const dto = plainToInstance(CreateVaccinationDto, {
        petId: '22222222-2222-4222-8222-222222222222',
        vaccineName: 'Rabia',
        appliedAt: 'not-a-date',
        nextDueDate: 'tomorrow',
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'appliedAt'));
      assert.ok(errors.some((e) => e.property === 'nextDueDate'));
    });

    it('QueryVaccinationDto debe validar y transformar page y limit correctamente', async () => {
      const dto = plainToInstance(QueryVaccinationDto, {
        page: '2',
        limit: '25',
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
      assert.strictEqual(dto.page, 2);
      assert.strictEqual(dto.limit, 25);
    });

    it('QueryVaccinationDto debe fallar si page < 1 o limit > 100', async () => {
      const dto = plainToInstance(QueryVaccinationDto, {
        page: 0,
        limit: 150,
      });

      const errors = await validate(dto);
      assert.ok(errors.some((e) => e.property === 'page'));
      assert.ok(errors.some((e) => e.property === 'limit'));
    });
  });
});
