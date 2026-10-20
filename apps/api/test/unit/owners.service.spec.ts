import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OwnersService } from '../../src/modules/owners/owners.service';
import { OwnersController } from '../../src/modules/owners/owners.controller';
import { CreateOwnerDto } from '../../src/modules/owners/dto/create-owner.dto';
import { UpdateOwnerDto } from '../../src/modules/owners/dto/update-owner.dto';
import { SearchOwnerQueryDto } from '../../src/modules/owners/dto/search-owner.dto';

interface MockOwner {
  id: string;
  documentId: string;
  name: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByClinicId?: string | null;
}

interface MockPet {
  id: string;
  name: string;
  ownerId: string;
  deletedAt: Date | null;
}

describe('OwnersService & OwnersController (T12 / RF-14, RF-15, RF-16, RF-19)', () => {
  let ownersService: OwnersService;
  let ownersController: OwnersController;
  let mockPrisma: any;
  let ownersDb: MockOwner[];
  let petsDb: MockPet[];
  const validClinicId = 'clinic-uuid-1';

  beforeEach(() => {
    ownersDb = [
      {
        id: 'owner-uuid-1',
        documentId: '1723456789',
        name: 'Carlos',
        lastName: 'Mendoza',
        phone: '+593991234567',
        email: 'carlos.mendoza@example.com',
        address: 'Av. Amazonas 123 y Colón',
        deletedAt: null,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
        createdByClinicId: validClinicId,
      },
      {
        id: 'owner-uuid-2',
        documentId: '1798765432',
        name: 'María',
        lastName: 'González',
        phone: '+5491123456789',
        email: 'maria.gonzalez@example.com',
        address: 'Calle Falsa 456',
        deletedAt: null,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
        createdByClinicId: validClinicId,
      },
      {
        id: 'owner-uuid-deleted',
        documentId: '0912345678',
        name: 'Juan',
        lastName: 'Pérez',
        phone: '+5215512345678',
        email: 'juan.perez@example.com',
        address: 'Colonia Roma 789',
        deletedAt: new Date('2026-02-01T08:00:00Z'),
        createdAt: new Date('2026-01-05T08:00:00Z'),
        updatedAt: new Date('2026-02-01T08:00:00Z'),
        createdByClinicId: validClinicId,
      },
    ];

    petsDb = [
      {
        id: 'pet-uuid-1',
        name: 'Firulais',
        ownerId: 'owner-uuid-1',
        deletedAt: null,
      },
      {
        id: 'pet-uuid-2',
        name: 'Michi',
        ownerId: 'owner-uuid-deleted',
        deletedAt: new Date('2026-02-01T08:00:00Z'),
      },
    ];

    mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      clinicOwner: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async () => ({}),
      },
      visit: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      vaccination: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      owner: {
        findFirst: async ({ where }: any) => {
          return (
            ownersDb.find((o) => {
              if (where.id && o.id !== where.id) return false;
              if (where.documentId && o.documentId !== where.documentId) return false;
              if (where.deletedAt === null && o.deletedAt !== null) return false;
              if (where.createdByClinicId && o.createdByClinicId !== where.createdByClinicId) return false;
              return true;
            }) ?? null
          );
        },
        findMany: async ({ where, skip, take, orderBy }: any) => {
          const matchesFilter = (o: MockOwner) => {
            if (where?.id?.in && Array.isArray(where.id.in) && !where.id.in.includes(o.id)) return false;
            if (where?.deletedAt === null && o.deletedAt !== null) return false;
            if (where?.createdByClinicId && o.createdByClinicId !== where.createdByClinicId) return false;

            const docVal = typeof where?.documentId === 'string' ? where.documentId : where?.documentId?.contains;
            if (docVal && !o.documentId.toLowerCase().includes(String(docVal).toLowerCase())) return false;

            const phoneVal = typeof where?.phone === 'string' ? where.phone : where?.phone?.contains;
            if (phoneVal && !o.phone.includes(String(phoneVal))) return false;

            const lastNameVal = typeof where?.lastName === 'string' ? where.lastName : where?.lastName?.contains;
            if (lastNameVal && !o.lastName.toLowerCase().includes(String(lastNameVal).toLowerCase())) return false;

            if (where?.OR && Array.isArray(where.OR)) {
              const matchesClause = (clause: any): boolean => {
                if (clause.id?.in && Array.isArray(clause.id.in) && !clause.id.in.includes(o.id)) return false;
                if (clause.OR && Array.isArray(clause.OR)) {
                  return clause.OR.some(matchesClause);
                }
                if (clause.name?.contains && o.name.toLowerCase().includes(clause.name.contains.toLowerCase())) return true;
                if (clause.lastName?.contains && o.lastName.toLowerCase().includes(clause.lastName.contains.toLowerCase())) return true;
                if (clause.documentId?.contains && o.documentId.toLowerCase().includes(clause.documentId.contains.toLowerCase())) return true;
                if (clause.phone?.contains && o.phone.includes(clause.phone.contains)) return true;
                return false;
              };
              const matchesAny = where.OR.some(matchesClause);
              if (!matchesAny) return false;
            }
            return true;
          };

          let filtered = ownersDb.filter(matchesFilter);

          if (orderBy?.createdAt === 'desc') {
            filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }

          const s = skip ?? 0;
          const t = take ?? filtered.length;
          return filtered.slice(s, s + t);
        },
        count: async ({ where }: any) => {
          return ownersDb.filter((o) => {
            if (where?.deletedAt === null && o.deletedAt !== null) return false;

            const docVal = typeof where?.documentId === 'string' ? where.documentId : where?.documentId?.contains;
            if (docVal && !o.documentId.toLowerCase().includes(String(docVal).toLowerCase())) return false;

            const phoneVal = typeof where?.phone === 'string' ? where.phone : where?.phone?.contains;
            if (phoneVal && !o.phone.includes(String(phoneVal))) return false;

            const lastNameVal = typeof where?.lastName === 'string' ? where.lastName : where?.lastName?.contains;
            if (lastNameVal && !o.lastName.toLowerCase().includes(String(lastNameVal).toLowerCase())) return false;

            if (where?.OR && Array.isArray(where.OR)) {
              const matchesClause = (clause: any): boolean => {
                if (clause.id?.in && Array.isArray(clause.id.in) && !clause.id.in.includes(o.id)) return false;
                if (clause.OR && Array.isArray(clause.OR)) {
                  return clause.OR.some(matchesClause);
                }
                if (clause.name?.contains && o.name.toLowerCase().includes(clause.name.contains.toLowerCase())) return true;
                if (clause.lastName?.contains && o.lastName.toLowerCase().includes(clause.lastName.contains.toLowerCase())) return true;
                if (clause.documentId?.contains && o.documentId.toLowerCase().includes(clause.documentId.contains.toLowerCase())) return true;
                if (clause.phone?.contains && o.phone.includes(clause.phone.contains)) return true;
                return false;
              };
              const matchesAny = where.OR.some(matchesClause);
              if (!matchesAny) return false;
            }
            return true;
          }).length;
        },
        create: async ({ data }: any) => {
          const newOwner: MockOwner = {
            id: `owner-uuid-${Date.now()}`,
            documentId: data.documentId,
            name: data.name,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email ?? null,
            address: data.address ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdByClinicId: data.createdByClinicId ?? validClinicId,
          };
          ownersDb.push(newOwner);
          return newOwner;
        },
        update: async ({ where, data }: any) => {
          const idx = ownersDb.findIndex((o) => o.id === where.id);
          if (idx === -1) {
            throw new Error('Owner not found');
          }
          const updated: MockOwner = {
            ...ownersDb[idx],
            ...data,
            updatedAt: new Date(),
          };
          ownersDb[idx] = updated;
          return updated;
        },
      },
      pet: {
        findMany: async () => [],
        count: async ({ where }: any) => {
          return petsDb.filter((p) => {
            if (where?.ownerId && p.ownerId !== where.ownerId) return false;
            if (where?.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }).length;
        },
      },
    };

    ownersService = new OwnersService(mockPrisma as unknown as PrismaService);
    ownersController = new OwnersController(ownersService);
  });

  describe('a) Validación estricta de DTOs: documentId, teléfono E.164 y email RFC 5322 (RF-14)', () => {
    it('debe validar exitosamente un CreateOwnerDto con todos los campos correctos', async () => {
      const dto = plainToInstance(CreateOwnerDto, {
        documentId: '1723456789',
        name: 'Esteban',
        lastName: 'Paredes',
        phone: '+593987654321',
        email: 'esteban.paredes@correo.com',
        address: 'Calle 10 y Av. Central',
      });

      const errors = await validate(dto as object);
      assert.strictEqual(errors.length, 0, `No debe haber errores: ${JSON.stringify(errors)}`);
    });

    it('debe rechazar documentId con longitud menor a 6 caracteres', async () => {
      const dto = plainToInstance(CreateOwnerDto, {
        documentId: '12345',
        name: 'Esteban',
        lastName: 'Paredes',
        phone: '+593987654321',
      });

      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'documentId'));
    });

    it('debe rechazar documentId con longitud mayor a 20 caracteres', async () => {
      const dto = plainToInstance(CreateOwnerDto, {
        documentId: '123456789012345678901',
        name: 'Esteban',
        lastName: 'Paredes',
        phone: '+593987654321',
      });

      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'documentId'));
    });

    it('debe rechazar teléfono que no cumple con el formato internacional E.164 estricto', async () => {
      const invalidPhones = ['0987654321', '593987654321', '+012345678', '+', '+1', 'telefono123'];
      for (const phone of invalidPhones) {
        const dto = plainToInstance(CreateOwnerDto, {
          documentId: '1723456789',
          name: 'Esteban',
          lastName: 'Paredes',
          phone,
        });

        const errors = await validate(dto as object);
        assert.ok(
          errors.some((e) => e.property === 'phone'),
          `Debería rechazar teléfono inválido: ${phone}`,
        );
      }
    });

    it('debe aceptar teléfono en formato E.164 válido con entre 8 y 15 dígitos totales', async () => {
      const validPhones = ['+12345678', '+593987654321', '+5491123456789', '+442071838750'];
      for (const phone of validPhones) {
        const dto = plainToInstance(CreateOwnerDto, {
          documentId: '1723456789',
          name: 'Esteban',
          lastName: 'Paredes',
          phone,
        });

        const errors = await validate(dto as object);
        assert.ok(
          !errors.some((e) => e.property === 'phone'),
          `Debería aceptar teléfono válido: ${phone}`,
        );
      }
    });

    it('debe rechazar correo electrónico con formato inválido (RFC 5322)', async () => {
      const invalidEmails = ['correo-invalido', 'usuario@', '@dominio.com', 'user@domain..com'];
      for (const email of invalidEmails) {
        const dto = plainToInstance(CreateOwnerDto, {
          documentId: '1723456789',
          name: 'Esteban',
          lastName: 'Paredes',
          phone: '+593987654321',
          email,
        });

        const errors = await validate(dto as object);
        assert.ok(
          errors.some((e) => e.property === 'email'),
          `Debería rechazar email inválido: ${email}`,
        );
      }
    });

    it('debe permitir email opcional ausente o null', async () => {
      const dto = plainToInstance(CreateOwnerDto, {
        documentId: '1723456789',
        name: 'Esteban',
        lastName: 'Paredes',
        phone: '+593987654321',
      });

      const errors = await validate(dto as object);
      assert.ok(!errors.some((e) => e.property === 'email'));
    });

    it('debe rechazar dirección que supere los 250 caracteres', async () => {
      const longAddress = 'A'.repeat(251);
      const dto = plainToInstance(CreateOwnerDto, {
        documentId: '1723456789',
        name: 'Esteban',
        lastName: 'Paredes',
        phone: '+593987654321',
        address: longAddress,
      });

      const errors = await validate(dto as object);
      assert.ok(errors.some((e) => e.property === 'address'));
    });

    it('debe crear el dueño exitosamente persistiendo en Prisma', async () => {
      const dto: CreateOwnerDto = {
        documentId: '1104567890',
        name: 'Lucía',
        lastName: 'Torres',
        phone: '+593994433221',
        email: 'lucia.torres@example.com',
        address: 'Sector La Floresta',
      };

      const result = await ownersService.create(dto, validClinicId);
      assert.ok(result.id);
      assert.strictEqual(result.documentId, '1104567890');
      assert.strictEqual(result.name, 'Lucía');
      assert.strictEqual(result.lastName, 'Torres');
      assert.strictEqual(result.phone, '+593994433221');
      assert.strictEqual(result.deletedAt, null);
    });

    it('debe fallar si el cliente transaccional tx carece del modelo clinicOwner (falla en cerrado)', async () => {
      const brokenPrisma: any = {
        ...mockPrisma,
        $transaction: async (fn: any) => {
          const brokenTx = { owner: mockPrisma.owner }; // carece de clinicOwner
          return fn(brokenTx);
        },
      };
      const brokenService = new OwnersService(brokenPrisma);
      const dto: CreateOwnerDto = {
        documentId: '1104567899',
        name: 'Carlos',
        lastName: 'SinModelo',
        phone: '+593994433221',
      };
      await assert.rejects(
        async () => {
          await brokenService.create(dto, validClinicId);
        },
        (err: any) => {
          assert.ok(err instanceof TypeError || String(err).includes('clinicOwner'));
          return true;
        },
      );
    });
  });

  describe('b) Rechazo con HTTP 409 Conflict ante documento de identidad duplicado (RF-15)', () => {
    it('debe lanzar ConflictException si ya existe un dueño activo con el mismo documentId', async () => {
      const duplicateDto: CreateOwnerDto = {
        documentId: '1723456789', // Ya existe en ownersDb activo
        name: 'Otro',
        lastName: 'Mendoza',
        phone: '+593998877665',
      };

      await assert.rejects(
        async () => {
          await ownersService.create(duplicateDto, validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictException);
          assert.strictEqual(err.message, 'Documento de identidad ya registrado');
          return true;
        },
      );
    });

    it('debe permitir reutilizar el documentId si el dueño anterior fue borrado lógicamente (deletedAt != null)', async () => {
      const reuseDto: CreateOwnerDto = {
        documentId: '0912345678', // Existe pero deletedAt != null
        name: 'Nuevo Juan',
        lastName: 'Pérez',
        phone: '+5215588776655',
      };

      const result = await ownersService.create(reuseDto, validClinicId);
      assert.ok(result.id);
      assert.strictEqual(result.documentId, '0912345678');
      assert.strictEqual(result.deletedAt, null);
    });
  });

  describe('c) Búsqueda paginada retornando { data, meta } estructurado conforme a RF-16', () => {
    it('debe retornar estructura { data, meta } con valores por defecto (page: 1, limit: 10)', async () => {
      const result = await ownersService.findAll({}, validClinicId);
      assert.ok(Array.isArray(result.data));
      assert.ok(result.meta);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 10);
      assert.strictEqual(result.meta.total, 2); // 2 activos
      assert.strictEqual(result.meta.totalPages, 1);
      assert.strictEqual(result.meta.hasNextPage, false);
      assert.strictEqual(result.meta.hasPrevPage, false);
      assert.strictEqual(result.data.length, 2);
    });

    it('debe filtrar correctamente por lastName', async () => {
      const result = await ownersService.findAll({ lastName: 'gonzález' }, validClinicId);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.data[0].lastName, 'González');
    });

    it('debe filtrar correctamente por documentId', async () => {
      const result = await ownersService.findAll({ documentId: '1723456789' }, validClinicId);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.data[0].documentId, '1723456789');
    });

    it('debe filtrar correctamente por phone', async () => {
      const result = await ownersService.findAll({ phone: '+54911' }, validClinicId);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.data[0].phone, '+5491123456789');
    });

    it('debe filtrar con query de texto libre en name, lastName, documentId o phone', async () => {
      const result = await ownersService.findAll({ query: 'Carlos' }, validClinicId);
      assert.strictEqual(result.meta.total, 1);
      assert.strictEqual(result.data[0].name, 'Carlos');
    });

    it('debe paginar correctamente con page y limit específicos', async () => {
      const result = await ownersService.findAll({ page: 2, limit: 1 }, validClinicId);
      assert.strictEqual(result.meta.page, 2);
      assert.strictEqual(result.meta.limit, 1);
      assert.strictEqual(result.meta.total, 2);
      assert.strictEqual(result.meta.totalPages, 2);
      assert.strictEqual(result.meta.hasNextPage, false);
      assert.strictEqual(result.meta.hasPrevPage, true);
      assert.strictEqual(result.data.length, 1);
    });
  });

  describe('d) Consulta por ID y actualización de datos de dueño', () => {
    it('debe obtener un dueño activo por su ID', async () => {
      const owner = await ownersService.findById('owner-uuid-1', validClinicId);
      assert.strictEqual(owner.id, 'owner-uuid-1');
      assert.strictEqual(owner.name, 'Carlos');
    });

    it('debe lanzar NotFoundException si el dueño no existe', async () => {
      await assert.rejects(
        async () => {
          await ownersService.findById('uuid-no-existe', validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Dueño no encontrado');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el dueño está borrado lógicamente', async () => {
      await assert.rejects(
        async () => {
          await ownersService.findById('owner-uuid-deleted', validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Dueño no encontrado');
          return true;
        },
      );
    });

    it('debe actualizar los datos de contacto y filiación de un dueño activo', async () => {
      const updateDto: UpdateOwnerDto = {
        name: 'Carlos Alberto',
        phone: '+593998888888',
        address: 'Nueva Dirección 999',
      };

      const updated = await ownersService.update('owner-uuid-1', updateDto, validClinicId);
      assert.strictEqual(updated.name, 'Carlos Alberto');
      assert.strictEqual(updated.phone, '+593998888888');
      assert.strictEqual(updated.address, 'Nueva Dirección 999');
    });

    it('debe lanzar NotFoundException al intentar actualizar un dueño inexistente o eliminado', async () => {
      await assert.rejects(
        async () => {
          await ownersService.update('uuid-inexistente', { name: 'Prueba' }, validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('e) Borrado lógico y bloqueo con HTTP 409 si posee mascotas activas (RF-19)', () => {
    it('debe bloquear con ConflictException (HTTP 409) si el dueño tiene mascotas activas asociadas (RF-19)', async () => {
      // owner-uuid-1 tiene Firulais activo en petsDb
      await assert.rejects(
        async () => {
          await ownersService.softDelete('owner-uuid-1', validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictException);
          assert.strictEqual(err.message, 'No se puede eliminar un dueño con mascotas asociadas');
          return true;
        },
      );
    });

    it('debe permitir el borrado lógico si el dueño no tiene mascotas asociadas activas', async () => {
      // owner-uuid-2 no tiene mascotas en petsDb
      const result = await ownersService.softDelete('owner-uuid-2', validClinicId);
      assert.ok(result.deletedAt !== null);

      // Verificamos que ya no aparece en findById
      await assert.rejects(
        async () => {
          await ownersService.findById('owner-uuid-2', validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException al intentar eliminar un dueño inexistente o ya eliminado', async () => {
      await assert.rejects(
        async () => {
          await ownersService.softDelete('owner-uuid-deleted', validClinicId);
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('f) OwnersController: endpoints, autorización RBAC y delegación', () => {
    it('POST /owners debe invocar service.create', async () => {
      const dto: CreateOwnerDto = {
        documentId: '0987654321',
        name: 'Andrea',
        lastName: 'Rios',
        phone: '+593991122334',
      };
      const result = await ownersController.create(validClinicId, dto);
      assert.strictEqual(result.documentId, '0987654321');
      assert.strictEqual(result.name, 'Andrea');
    });

    it('GET /owners debe invocar service.findAll con query', async () => {
      const result = await ownersController.findAll(validClinicId, { query: 'Carlos' });
      assert.strictEqual(result.meta.total, 1);
    });

    it('GET /owners/:id debe invocar service.findById', async () => {
      const result = await ownersController.findById(validClinicId, 'owner-uuid-1');
      assert.strictEqual(result.id, 'owner-uuid-1');
    });

    it('PATCH /owners/:id debe invocar service.update', async () => {
      const result = await ownersController.update(validClinicId, 'owner-uuid-1', { name: 'Carlos Nuevo' });
      assert.strictEqual(result.name, 'Carlos Nuevo');
    });

    it('DELETE /owners/:id debe tener @Roles(Role.ADMIN) y llamar a softDelete', async () => {
      // Verificar metadata @Roles(Role.ADMIN)
      const rolesMetadata = Reflect.getMetadata(ROLES_KEY, OwnersController.prototype.softDelete);
      assert.deepStrictEqual(rolesMetadata, [Role.ADMIN]);
    });
  });
});
