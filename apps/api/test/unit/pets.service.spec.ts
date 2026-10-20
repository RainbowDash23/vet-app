import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PetSex, PetSpecies, ReproductiveStatus, Role, TagStatus } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PetsService } from '../../src/modules/pets/pets.service';
import { PetsController } from '../../src/modules/pets/pets.controller';
import { CreatePetDto } from '../../src/modules/pets/dto/create-pet.dto';
import { UpdatePetDto } from '../../src/modules/pets/dto/update-pet.dto';
import { SearchPetQueryDto } from '../../src/modules/pets/dto/search-pet.dto';

interface MockOwner {
  id: string;
  documentId: string;
  name: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  deletedAt: Date | null;
  createdByClinicId?: string | null;
}

interface MockPet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  sex: PetSex;
  birthDate: Date | null;
  isApproximateBirthDate: boolean;
  color: string | null;
  reproductiveStatus: ReproductiveStatus;
  notes: string | null;
  ownerId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByClinicId?: string | null;
}

interface MockTag {
  id: string;
  uid: string;
  publicCode: string;
  status: TagStatus;
  petId: string | null;
  deletedAt: Date | null;
}

interface MockVisit {
  id: string;
  petId: string;
  clinicId: string;
  veterinarianId: string;
  status: string;
}

describe('PetsService & PetsController (T13 / RF-17, RF-18, RF-19, RF-20)', () => {
  let petsService: PetsService;
  let petsController: PetsController;
  let mockPrisma: any;
  let ownersDb: MockOwner[];
  let petsDb: MockPet[];
  let tagsDb: MockTag[];
  let visitsDb: MockVisit[];
  const validClinicId = 'clinic-uuid-1';

  beforeEach(() => {
    ownersDb = [
      {
        id: 'owner-uuid-1',
        documentId: '1723456789',
        name: 'Carlos',
        lastName: 'Mendoza',
        phone: '+593991234567',
        email: 'carlos@example.com',
        address: 'Av. Amazonas 123',
        deletedAt: null,
        createdByClinicId: validClinicId,
      },
      {
        id: 'owner-uuid-deleted',
        documentId: '1798765432',
        name: 'Elena',
        lastName: 'Vásquez',
        phone: '+593987654321',
        email: 'elena@example.com',
        address: 'Av. 10 de Agosto 456',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdByClinicId: validClinicId,
      },
    ];

    petsDb = [
      {
        id: 'pet-uuid-1',
        name: 'Max',
        species: PetSpecies.CANINE,
        breed: 'Golden Retriever',
        sex: PetSex.MALE,
        birthDate: new Date('2022-03-15T00:00:00.000Z'),
        isApproximateBirthDate: false,
        color: 'Dorado',
        reproductiveStatus: ReproductiveStatus.INTACT,
        notes: 'Alergia al polen',
        ownerId: 'owner-uuid-1',
        deletedAt: null,
        createdAt: new Date('2022-04-01T10:00:00.000Z'),
        updatedAt: new Date('2022-04-01T10:00:00.000Z'),
        createdByClinicId: validClinicId,
      },
      {
        id: 'pet-uuid-2',
        name: 'Luna',
        species: PetSpecies.FELINE,
        breed: 'Siamés',
        sex: PetSex.FEMALE,
        birthDate: new Date('2023-06-20T00:00:00.000Z'),
        isApproximateBirthDate: true,
        color: 'Crema y marrón',
        reproductiveStatus: ReproductiveStatus.SPAYED,
        notes: null,
        ownerId: 'owner-uuid-1',
        deletedAt: null,
        createdAt: new Date('2023-07-01T10:00:00.000Z'),
        updatedAt: new Date('2023-07-01T10:00:00.000Z'),
        createdByClinicId: validClinicId,
      },
      {
        id: 'pet-uuid-deleted',
        name: 'Boby',
        species: PetSpecies.CANINE,
        breed: 'Mestizo',
        sex: PetSex.MALE,
        birthDate: new Date('2020-01-01T00:00:00.000Z'),
        isApproximateBirthDate: false,
        color: 'Negro',
        reproductiveStatus: ReproductiveStatus.NEUTERED,
        notes: null,
        ownerId: 'owner-uuid-1',
        deletedAt: new Date('2025-12-01T00:00:00.000Z'),
        createdAt: new Date('2020-01-10T10:00:00.000Z'),
        updatedAt: new Date('2025-12-01T00:00:00.000Z'),
        createdByClinicId: validClinicId,
      },
    ];

    tagsDb = [
      {
        id: 'tag-uuid-1',
        uid: '04A1B2C3D4E5F6',
        publicCode: '11111111-1111-4111-8111-111111111111',
        status: TagStatus.ACTIVE,
        petId: 'pet-uuid-1',
        deletedAt: null,
      },
      {
        id: 'tag-uuid-2',
        uid: '04B2C3D4E5F6A1',
        publicCode: '22222222-2222-4222-8222-222222222222',
        status: TagStatus.INACTIVE,
        petId: 'pet-uuid-2',
        deletedAt: null,
      },
    ];

    visitsDb = [
      {
        id: 'visit-uuid-1',
        petId: 'pet-uuid-1',
        clinicId: validClinicId,
        veterinarianId: 'user-vet-1',
        status: 'COMPLETED',
      },
    ];

    mockPrisma = {
      clinicOwner: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      owner: {
        findFirst: async ({ where }: any) => {
          return ownersDb.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.deletedAt === null && o.deletedAt !== null) return false;
            return true;
          }) ?? null;
        },
      },
      pet: {
        create: async ({ data }: any) => {
          const newPet: MockPet = {
            id: `pet-uuid-${Date.now()}`,
            name: data.name,
            species: data.species,
            breed: data.breed ?? null,
            sex: data.sex ?? PetSex.UNKNOWN,
            birthDate: data.birthDate ? new Date(data.birthDate) : null,
            isApproximateBirthDate: data.isApproximateBirthDate ?? false,
            color: data.color ?? null,
            reproductiveStatus: data.reproductiveStatus ?? ReproductiveStatus.UNKNOWN,
            notes: data.notes ?? null,
            ownerId: data.ownerId,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdByClinicId: data.createdByClinicId ?? validClinicId,
          };
          petsDb.push(newPet);
          return newPet;
        },
        findFirst: async ({ where, include }: any) => {
          const pet = petsDb.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          });
          if (!pet) return null;
          const res: any = { ...pet };
          if (include?.owner) {
            res.owner = ownersDb.find((o) => o.id === pet.ownerId && o.deletedAt === null) ?? null;
          }
          if (include?.tags) {
            res.tags = tagsDb.filter((t) => t.petId === pet.id && t.deletedAt === null);
          }
          if (include?.visits) {
            res.visits = visitsDb.filter((v) => v.petId === pet.id);
          }
          return res;
        },
        findMany: async ({ where, skip, take }: any) => {
          let list = petsDb.filter((p) => {
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            if (where.ownerId && p.ownerId !== where.ownerId) return false;
            if (where.species && p.species !== where.species) return false;
            if (where.OR) {
              const matchesOr = where.OR.some((cond: any) => {
                if (cond.name?.contains) {
                  return p.name.toLowerCase().includes(cond.name.contains.toLowerCase());
                }
                return false;
              });
              if (!matchesOr) return false;
            }
            return true;
          });
          if (skip !== undefined && take !== undefined) {
            list = list.slice(skip, skip + take);
          }
          return list;
        },
        count: async ({ where }: any) => {
          return petsDb.filter((p) => {
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            if (where.ownerId && p.ownerId !== where.ownerId) return false;
            if (where.species && p.species !== where.species) return false;
            if (where.OR) {
              const matchesOr = where.OR.some((cond: any) => {
                if (cond.name?.contains) {
                  return p.name.toLowerCase().includes(cond.name.contains.toLowerCase());
                }
                return false;
              });
              if (!matchesOr) return false;
            }
            return true;
          }).length;
        },
        update: async ({ where, data }: any) => {
          const pet = petsDb.find((p) => p.id === where.id);
          if (!pet) throw new Error('Pet not found');
          Object.assign(pet, data, { updatedAt: new Date() });
          return pet;
        },
      },
      tag: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          tagsDb.forEach((t) => {
            if (where.petId && t.petId !== where.petId) return;
            if (where.status && t.status !== where.status) return;
            Object.assign(t, data);
            count++;
          });
          return { count };
        },
      },
      visit: {
        count: async ({ where }: any) => {
          return visitsDb.filter((v) => {
            if (where.petId && v.petId !== where.petId) return false;
            return true;
          }).length;
        },
      },
      $transaction: async (fn: any) => {
        if (typeof fn === 'function') {
          return fn(mockPrisma);
        }
        return Promise.all(fn);
      },
    };

    petsService = new PetsService(mockPrisma as unknown as PrismaService);
    petsController = new PetsController(petsService);
  });

  describe('a) Creación de mascota vinculada 1:N a dueño (RF-17)', () => {
    it('debe registrar exitosamente una mascota con datos biológicos completos', async () => {
      const dto: CreatePetDto = {
        name: 'Rocky',
        species: PetSpecies.CANINE,
        breed: 'Pastor Alemán',
        sex: PetSex.MALE,
        birthDate: '2023-01-10T00:00:00.000Z' as any,
        isApproximateBirthDate: false,
        color: 'Negro y fuego',
        reproductiveStatus: ReproductiveStatus.INTACT,
        notes: 'Microchip pendiente',
        ownerId: 'owner-uuid-1',
      };

      const result = await petsService.create(dto, validClinicId);

      assert.ok(result);
      assert.strictEqual(result.name, 'Rocky');
      assert.strictEqual(result.species, PetSpecies.CANINE);
      assert.strictEqual(result.breed, 'Pastor Alemán');
      assert.strictEqual(result.sex, PetSex.MALE);
      assert.strictEqual(result.ownerId, 'owner-uuid-1');
      assert.strictEqual(result.reproductiveStatus, ReproductiveStatus.INTACT);
      assert.strictEqual(result.isApproximateBirthDate, false);
      assert.strictEqual(result.deletedAt, null);
    });

    it('debe asignar valores por defecto a sex (UNKNOWN), reproductiveStatus (UNKNOWN) e isApproximateBirthDate (false)', async () => {
      const dto: CreatePetDto = {
        name: 'Mishi',
        species: PetSpecies.FELINE,
        birthDate: '2024-05-01T00:00:00.000Z' as any,
        ownerId: 'owner-uuid-1',
      };

      const result = await petsService.create(dto, validClinicId);

      assert.strictEqual(result.name, 'Mishi');
      assert.strictEqual(result.sex, PetSex.UNKNOWN);
      assert.strictEqual(result.reproductiveStatus, ReproductiveStatus.UNKNOWN);
      assert.strictEqual(result.isApproximateBirthDate, false);
    });
  });

  describe('b) Rechazo con HTTP 404 Not Found si ownerId no existe o presenta borrado lógico (RF-18)', () => {
    it('debe arrojar NotFoundException cuando el ownerId no existe en la base de datos', async () => {
      const dto: CreatePetDto = {
        name: 'Thor',
        species: PetSpecies.CANINE,
        birthDate: '2023-01-01T00:00:00.000Z' as any,
        ownerId: 'non-existent-owner-uuid',
      };

      await assert.rejects(
        async () => {
          await petsService.create(dto, validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Dueño no encontrado o inactivo');
          assert.strictEqual(err.getStatus(), 404);
          return true;
        },
      );
    });

    it('debe arrojar NotFoundException cuando el dueño posee borrado lógico (deletedAt != null)', async () => {
      const dto: CreatePetDto = {
        name: 'Thor',
        species: PetSpecies.CANINE,
        birthDate: '2023-01-01T00:00:00.000Z' as any,
        ownerId: 'owner-uuid-deleted',
      };

      await assert.rejects(
        async () => {
          await petsService.create(dto, validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Dueño no encontrado o inactivo');
          assert.strictEqual(err.getStatus(), 404);
          return true;
        },
      );
    });
  });

  describe('c) Bloqueo con HTTP 409 Conflict ante intento de eliminación de mascota con visitas (RF-19)', () => {
    it('debe arrojar ConflictException si la mascota posee visitas clínicas registradas', async () => {
      // pet-uuid-1 tiene una visita registrada en visitsDb
      await assert.rejects(
        async () => {
          await petsService.softDelete('pet-uuid-1', validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof ConflictException);
          assert.strictEqual(
            err.message,
            'No se puede eliminar una mascota con visitas clínicas registradas',
          );
          assert.strictEqual(err.getStatus(), 409);
          return true;
        },
      );
    });

    it('debe arrojar NotFoundException si la mascota a eliminar no existe o ya está eliminada', async () => {
      await assert.rejects(
        async () => {
          await petsService.softDelete('pet-uuid-deleted', validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada');
          assert.strictEqual(err.getStatus(), 404);
          return true;
        },
      );
    });
  });

  describe('d) Borrado lógico de mascota conmutando atómicamente el tag activo a INACTIVE (RF-20)', () => {
    it('debe aplicar borrado lógico marcando deletedAt y desactivar atómicamente tags activos mediante $transaction', async () => {
      // Configuramos una mascota sin visitas con un tag ACTIVE
      const petWithoutVisits: MockPet = {
        id: 'pet-no-visits',
        name: 'Chispita',
        species: PetSpecies.CANINE,
        breed: 'Poodle',
        sex: PetSex.FEMALE,
        birthDate: new Date('2021-01-01'),
        isApproximateBirthDate: false,
        color: 'Blanco',
        reproductiveStatus: ReproductiveStatus.SPAYED,
        notes: null,
        ownerId: 'owner-uuid-1',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByClinicId: validClinicId,
      };
      petsDb.push(petWithoutVisits);

      const activeTag: MockTag = {
        id: 'tag-chispa',
        uid: 'E004010000000001',
        publicCode: '33333333-3333-4333-8333-333333333333',
        status: TagStatus.ACTIVE,
        petId: 'pet-no-visits',
        deletedAt: null,
      };
      tagsDb.push(activeTag);

      const deleted = await petsService.softDelete('pet-no-visits', validClinicId);

      assert.ok(deleted.deletedAt instanceof Date);
      // El tag debe haber cambiado a INACTIVE
      const updatedTag = tagsDb.find((t) => t.id === 'tag-chispa');
      assert.strictEqual(updatedTag?.status, TagStatus.INACTIVE);
    });
  });

  describe('e) Búsqueda y consulta paginada estándar { data, meta }', () => {
    it('debe retornar estructura paginada { data, meta } respetando filtros por deletedAt: null', async () => {
      const result = await petsService.findAll({ page: 1, limit: 10 });

      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 2); // pet-uuid-1 y pet-uuid-2 activos
      assert.deepStrictEqual(result.meta, {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('debe filtrar por species', async () => {
      const result = await petsService.findAll({ species: PetSpecies.FELINE, page: 1, limit: 10 });

      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].name, 'Luna');
      assert.strictEqual(result.meta.total, 1);
    });

    it('debe filtrar por ownerId', async () => {
      const result = await petsService.findAll({ ownerId: 'owner-uuid-1', page: 1, limit: 10 });

      assert.strictEqual(result.meta.total, 2);
    });

    it('debe filtrar por nombre (query)', async () => {
      const result = await petsService.findAll({ query: 'Max', page: 1, limit: 10 });

      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].name, 'Max');
    });

    it('findById debe retornar la mascota con datos de dueño y tags incluidos', async () => {
      const pet = await petsService.findById('pet-uuid-1', validClinicId);

      assert.strictEqual(pet.id, 'pet-uuid-1');
      assert.strictEqual(pet.name, 'Max');
      assert.ok((pet as any).owner);
      assert.strictEqual((pet as any).owner.name, 'Carlos');
      assert.ok(Array.isArray((pet as any).tags));
      assert.strictEqual((pet as any).tags.length, 1);
    });

    it('findById debe lanzar NotFoundException si no existe o fue eliminada', async () => {
      await assert.rejects(
        async () => {
          await petsService.findById('pet-uuid-deleted', validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada');
          return true;
        },
      );
    });
  });

  describe('f) Actualización de mascota (update)', () => {
    it('debe actualizar los atributos editables de una mascota activa', async () => {
      const updateDto: UpdatePetDto = {
        name: 'Maximus',
        reproductiveStatus: ReproductiveStatus.NEUTERED,
        color: 'Dorado oscuro',
      };

      const updated = await petsService.update('pet-uuid-1', updateDto, validClinicId);

      assert.strictEqual(updated.name, 'Maximus');
      assert.strictEqual(updated.reproductiveStatus, ReproductiveStatus.NEUTERED);
      assert.strictEqual(updated.color, 'Dorado oscuro');
    });

    it('debe validar existencia del dueño si se actualiza ownerId', async () => {
      const updateDto: UpdatePetDto = {
        ownerId: 'owner-uuid-deleted',
      };

      await assert.rejects(
        async () => {
          await petsService.update('pet-uuid-1', updateDto, validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Dueño no encontrado o inactivo');
          return true;
        },
      );
    });

    it('debe arrojar NotFoundException si la mascota a actualizar no existe', async () => {
      await assert.rejects(
        async () => {
          await petsService.update('non-existent-pet', { name: 'Otro' }, validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada');
          return true;
        },
      );
    });
  });

  describe('g) Integración de PetsController y decoradores RBAC', () => {
    it('POST /pets debe delegar a petsService.create', async () => {
      const dto: CreatePetDto = {
        name: 'Balto',
        species: PetSpecies.CANINE,
        birthDate: '2024-01-01T00:00:00.000Z' as any,
        ownerId: 'owner-uuid-1',
      };

      const res = await petsController.create(validClinicId, dto);
      assert.strictEqual(res.name, 'Balto');
    });

    it('GET /pets debe delegar a petsService.findAll', async () => {
      const res = await petsController.findAll({});
      assert.ok(res.data);
      assert.ok(res.meta);
    });

    it('GET /pets/:id debe delegar a petsService.findById', async () => {
      const res = await petsController.findById(validClinicId, 'pet-uuid-1');
      assert.strictEqual(res.id, 'pet-uuid-1');
    });

    it('PATCH /pets/:id debe delegar a petsService.update', async () => {
      const res = await petsController.update(validClinicId, 'pet-uuid-1', { name: 'Max Updated' });
      assert.strictEqual(res.name, 'Max Updated');
    });

    it('DELETE /pets/:id debe contar con el decorador @Roles(Role.ADMIN)', () => {
      const rolesMeta = Reflect.getMetadata(ROLES_KEY, PetsController.prototype.softDelete);
      assert.deepStrictEqual(rolesMeta, [Role.ADMIN]);
    });
  });

  describe('h) Validación estricta de DTOs con class-validator', () => {
    it('CreatePetDto debe fallar si falta el name o es vacío', async () => {
      const dto = plainToInstance(CreatePetDto, {
        species: PetSpecies.CANINE,
        birthDate: '2024-01-01T00:00:00.000Z',
        ownerId: '11111111-1111-4111-8111-111111111111',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'name'));
    });

    it('CreatePetDto debe fallar si species no es un enum válido', async () => {
      const dto = plainToInstance(CreatePetDto, {
        name: 'Toby',
        species: 'DRAGON',
        birthDate: '2024-01-01T00:00:00.000Z',
        ownerId: '11111111-1111-4111-8111-111111111111',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'species'));
    });

    it('CreatePetDto debe fallar si birthDate no es una fecha válida', async () => {
      const dto = plainToInstance(CreatePetDto, {
        name: 'Toby',
        species: PetSpecies.CANINE,
        birthDate: 'not-a-date',
        ownerId: '11111111-1111-4111-8111-111111111111',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'birthDate'));
    });

    it('CreatePetDto debe fallar si ownerId no es un UUID válido', async () => {
      const dto = plainToInstance(CreatePetDto, {
        name: 'Toby',
        species: PetSpecies.CANINE,
        birthDate: '2024-01-01T00:00:00.000Z',
        ownerId: '123-not-a-uuid',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'ownerId'));
    });

    it('CreatePetDto debe ser válido cuando todos los campos requeridos y opcionales son correctos', async () => {
      const dto = plainToInstance(CreatePetDto, {
        name: 'Toby',
        species: PetSpecies.CANINE,
        breed: 'Labrador',
        sex: PetSex.MALE,
        birthDate: '2023-05-15T00:00:00.000Z',
        isApproximateBirthDate: true,
        color: 'Amarillo',
        reproductiveStatus: ReproductiveStatus.INTACT,
        notes: 'Ninguna',
        ownerId: '11111111-1111-4111-8111-111111111111',
      });
      const errors = await validate(dto as object);
      assert.strictEqual(errors.length, 0);
    });

    it('SearchPetQueryDto debe aceptar valores válidos de paginación y filtros', async () => {
      const dto = plainToInstance(SearchPetQueryDto, {
        page: '2',
        limit: '25',
        species: PetSpecies.FELINE,
        ownerId: '11111111-1111-4111-8111-111111111111',
        query: 'Pelusa',
      });
      const errors = await validate(dto as object);
      assert.strictEqual(errors.length, 0);
      assert.strictEqual((dto as SearchPetQueryDto).page, 2);
      assert.strictEqual((dto as SearchPetQueryDto).limit, 25);
    });
  });
});
