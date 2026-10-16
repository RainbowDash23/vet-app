import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as bcrypt from 'bcryptjs';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { UsersService } from '../../src/modules/users/users.service';
import { UsersController } from '../../src/modules/users/users.controller';
import { CreateUserDto } from '../../src/modules/users/dto/create-user.dto';
import { UpdateUserDto } from '../../src/modules/users/dto/update-user.dto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TokenRevocationService } from '../../src/modules/auth/token-revocation.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

describe('UsersService & UsersController (T11 / RF-10, RF-11, RF-12, RF-13)', () => {
  let usersService: UsersService;
  let usersController: UsersController;
  let mockPrisma: any;
  let mockTokenRevocation: any;
  let usersDb: User[];
  let revokedUserIds: string[];

  const CLINIC_1 = 'clinic-uuid-0001';
  const CLINIC_2 = 'clinic-uuid-0002';

  beforeEach(() => {
    usersDb = [
      {
        id: 'user-admin-1',
        email: 'admin@clinic1.com',
        password: '$2a$12$e8M1c0N.FakeHashAdmin12Rounds1234567890123456789012',
        name: 'Administrador Clínica 1',
        role: Role.ADMIN,
        clinicId: CLINIC_1,
        licenseNumber: null,
        phone: '+593991111111',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'user-vet-1',
        email: 'vet1@clinic1.com',
        password: '$2a$12$e8M1c0N.FakeHashVet112Rounds1234567890123456789012',
        name: 'Dra. Ana López',
        role: Role.VET,
        clinicId: CLINIC_1,
        licenseNumber: 'VET-12345',
        phone: '+593992222222',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
      },
      {
        id: 'user-rec-1',
        email: 'reception@clinic1.com',
        password: '$2a$12$e8M1c0N.FakeHashRec112Rounds1234567890123456789012',
        name: 'Carlos Recepción',
        role: Role.RECEPTION,
        clinicId: CLINIC_1,
        licenseNumber: null,
        phone: '+593993333333',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-01-03'),
        updatedAt: new Date('2026-01-03'),
      },
      {
        id: 'user-vet-c2',
        email: 'vet@clinic2.com',
        password: '$2a$12$e8M1c0N.FakeHashVet212Rounds1234567890123456789012',
        name: 'Dr. Beto Clínica 2',
        role: Role.VET,
        clinicId: CLINIC_2,
        licenseNumber: 'VET-99999',
        phone: '+593994444444',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-01-04'),
        updatedAt: new Date('2026-01-04'),
      },
      {
        id: 'user-deleted-1',
        email: 'deleted@clinic1.com',
        password: '$2a$12$e8M1c0N.FakeHashDel112Rounds1234567890123456789012',
        name: 'Usuario Desvinculado',
        role: Role.VET,
        clinicId: CLINIC_1,
        licenseNumber: 'VET-OLD-001',
        phone: '+593995555555',
        isActive: false,
        deletedAt: new Date('2026-02-01'),
        createdAt: new Date('2026-01-05'),
        updatedAt: new Date('2026-02-01'),
      },
    ];

    revokedUserIds = [];

    mockPrisma = {
      user: {
        findFirst: async ({ where }: any) => {
          return (
            usersDb.find((u) => {
              if (where.id && u.id !== where.id) return false;
              if (where.clinicId && u.clinicId !== where.clinicId) return false;
              if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) return false;
              if (where.licenseNumber && u.licenseNumber !== where.licenseNumber) return false;
              if (where.deletedAt === null && u.deletedAt !== null) return false;
              return true;
            }) ?? null
          );
        },
        findMany: async ({ where }: any) => {
          return usersDb.filter((u) => {
            if (where?.clinicId && u.clinicId !== where.clinicId) return false;
            if (where?.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          });
        },
        create: async ({ data }: any) => {
          const newUser: User = {
            id: `user-${Date.now()}`,
            email: data.email,
            password: data.password,
            name: data.name,
            role: data.role,
            clinicId: data.clinicId,
            licenseNumber: data.licenseNumber ?? null,
            phone: data.phone ?? null,
            isActive: data.isActive ?? true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          usersDb.push(newUser);
          return newUser;
        },
        update: async ({ where, data }: any) => {
          const idx = usersDb.findIndex((u) => u.id === where.id);
          if (idx === -1) {
            throw new Error('User not found in mock');
          }
          const updated: User = {
            ...usersDb[idx],
            ...data,
            updatedAt: new Date(),
          };
          usersDb[idx] = updated;
          return updated;
        },
      },
    };

    mockTokenRevocation = {
      revokeUserRefreshTokens: async (userId: string) => {
        revokedUserIds.push(userId);
        return 1;
      },
    };

    usersService = new UsersService(
      mockPrisma as unknown as PrismaService,
      mockTokenRevocation as unknown as TokenRevocationService,
    );
    usersController = new UsersController(usersService);
  });

  describe('a) Validación condicional de atributos para rol VET (RF-10)', () => {
    it('debe exigir licenseNumber obligatorio cuando role === Role.VET y lanzar BadRequestException si falta', async () => {
      const dtoMissingLicense: CreateUserDto = {
        name: 'Dr. Sin Cédula',
        email: 'sicedula@clinic1.com',
        password: 'Password123!',
        role: Role.VET,
      };

      await assert.rejects(
        async () => {
          await usersService.create(CLINIC_1, dtoMissingLicense);
        },
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.message, /licenseNumber/i);
          return true;
        },
      );
    });

    it('debe rechazar con BadRequestException si licenseNumber es una cadena vacía o puros espacios para VET', async () => {
      const dtoEmptyLicense: CreateUserDto = {
        name: 'Dr. Cédula Vacía',
        email: 'cedulavacia@clinic1.com',
        password: 'Password123!',
        role: Role.VET,
        licenseNumber: '   ',
      };

      await assert.rejects(
        async () => {
          await usersService.create(CLINIC_1, dtoEmptyLicense);
        },
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          return true;
        },
      );
    });

    it('debe permitir crear usuario RECEPTION o ADMIN sin licenseNumber', async () => {
      const dtoReception: CreateUserDto = {
        name: 'Nuevo Recepcionista',
        email: 'nuevorec@clinic1.com',
        password: 'Password123!',
        role: Role.RECEPTION,
      };

      const result = await usersService.create(CLINIC_1, dtoReception);
      assert.strictEqual(result.role, Role.RECEPTION);
      assert.strictEqual(result.email, 'nuevorec@clinic1.com');
      assert.strictEqual(result.licenseNumber, null);
      assert.strictEqual('password' in result, false, 'No debe exponer el hash de contraseña');
    });

    it('debe crear exitosamente un VET cuando licenseNumber es válido y suministrado', async () => {
      const dtoVet: CreateUserDto = {
        name: 'Dr. Roberto Santos',
        email: 'roberto.santos@clinic1.com',
        password: 'Password123!',
        role: Role.VET,
        licenseNumber: 'VET-88776',
        specialty: 'Cirugía de Pequeñas Especies',
        phone: '+593998877665',
      };

      const result = await usersService.create(CLINIC_1, dtoVet);
      assert.strictEqual(result.role, Role.VET);
      assert.strictEqual(result.licenseNumber, 'VET-88776');
      assert.strictEqual(result.clinicId, CLINIC_1);
      assert.strictEqual(result.isActive, true);
    });
  });

  describe('b) Prevención de colisiones de correo y cédula profesional (RF-11)', () => {
    it('debe rechazar con HTTP 409 Conflict ante duplicidad de email en usuario activo', async () => {
      const dtoDuplicateEmail: CreateUserDto = {
        name: 'Duplicado Email',
        email: 'vet1@clinic1.com', // Ya existe activo
        password: 'Password123!',
        role: Role.RECEPTION,
      };

      await assert.rejects(
        async () => {
          await usersService.create(CLINIC_1, dtoDuplicateEmail);
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictException);
          assert.match(err.message, /correo|email/i);
          return true;
        },
      );
    });

    it('debe rechazar con HTTP 409 Conflict ante duplicidad de licenseNumber en veterinario activo', async () => {
      const dtoDuplicateLicense: CreateUserDto = {
        name: 'Dr. Con Licencia Duplicada',
        email: 'otroveterinario@clinic1.com',
        password: 'Password123!',
        role: Role.VET,
        licenseNumber: 'VET-12345', // Ya asignado a user-vet-1 activo
      };

      await assert.rejects(
        async () => {
          await usersService.create(CLINIC_1, dtoDuplicateLicense);
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictException);
          assert.match(err.message, /cédula|licenseNumber/i);
          return true;
        },
      );
    });

    it('debe permitir reutilizar el email de un usuario con borrado lógico (deletedAt != null)', async () => {
      const dtoReusingDeletedEmail: CreateUserDto = {
        name: 'Reactivado Email',
        email: 'deleted@clinic1.com', // Está con deletedAt !== null
        password: 'Password123!',
        role: Role.RECEPTION,
      };

      const result = await usersService.create(CLINIC_1, dtoReusingDeletedEmail);
      assert.strictEqual(result.email, 'deleted@clinic1.com');
      assert.strictEqual(result.isActive, true);
    });

    it('debe permitir reutilizar el licenseNumber de un veterinario con borrado lógico', async () => {
      const dtoReusingDeletedLicense: CreateUserDto = {
        name: 'Nuevo Vet Reutilizando Cedula',
        email: 'nuevovet@clinic1.com',
        password: 'Password123!',
        role: Role.VET,
        licenseNumber: 'VET-OLD-001', // Asignado a user-deleted-1
      };

      const result = await usersService.create(CLINIC_1, dtoReusingDeletedLicense);
      assert.strictEqual(result.licenseNumber, 'VET-OLD-001');
    });
  });

  describe('c) Salteo criptográfico con 12 rondas de bcrypt y sanitización', () => {
    it('debe almacenar la contraseña hasheada con bcrypt usando exactamente 12 rondas', async () => {
      const plainPassword = 'StrongPassword!123';
      const dto: CreateUserDto = {
        name: 'Test Salt User',
        email: 'salttest@clinic1.com',
        password: plainPassword,
        role: Role.RECEPTION,
      };

      const result = await usersService.create(CLINIC_1, dto);
      const stored = usersDb.find((u) => u.id === result.id);
      assert.ok(stored, 'El usuario debe persistirse en la base de datos');

      // Un hash bcrypt con 12 rondas comienza con $2a$12$ o $2b$12$
      assert.match(stored.password, /^\$2[ab]\$12\$/);

      const matches = await bcrypt.compare(plainPassword, stored.password);
      assert.strictEqual(matches, true, 'El hash debe verificar la contraseña original');
    });

    it('el resultado de create, findAll, findById y update nunca debe exponer el campo password', async () => {
      const dto: CreateUserDto = {
        name: 'Sanitized User',
        email: 'sanitized@clinic1.com',
        password: 'Password123!',
        role: Role.RECEPTION,
      };

      const created: any = await usersService.create(CLINIC_1, dto);
      assert.strictEqual(created.password, undefined);

      const found: any = await usersService.findById(CLINIC_1, created.id);
      assert.strictEqual(found.password, undefined);

      const list: any[] = await usersService.findAll(CLINIC_1);
      for (const u of list) {
        assert.strictEqual(u.password, undefined);
      }

      const updated: any = await usersService.update(CLINIC_1, created.id, { name: 'Updated Name' });
      assert.strictEqual(updated.password, undefined);
    });
  });

  describe('d) Actualización de perfiles y disponibilidad horaria (RF-12)', () => {
    it('debe actualizar perfil y disponibilidad horaria de un usuario', async () => {
      const updateDto: UpdateUserDto = {
        name: 'Dra. Ana López Especialista',
        phone: '+593999999999',
        specialty: 'Cardiología Veterinaria',
        availability: JSON.stringify({ lunes: '08:00-14:00', martes: '08:00-14:00' }),
      };

      const updated = await usersService.update(CLINIC_1, 'user-vet-1', updateDto);
      assert.strictEqual(updated.name, 'Dra. Ana López Especialista');
      assert.strictEqual(updated.phone, '+593999999999');
    });

    it('debe rechazar con HTTP 409 Conflict si la actualización de licenseNumber colisiona con otro veterinario activo', async () => {
      const updateDto: UpdateUserDto = {
        licenseNumber: 'VET-99999', // Asignado al vet de Clinic 2
      };

      await assert.rejects(
        async () => {
          await usersService.update(CLINIC_1, 'user-vet-1', updateDto);
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictException);
          return true;
        },
      );
    });

    it('debe rechazar con HTTP 404 Not Found si el usuario no existe o pertenece a otra clínica', async () => {
      await assert.rejects(
        async () => {
          // Intentar actualizar usuario de CLINIC_2 usando el tenant CLINIC_1
          await usersService.update(CLINIC_1, 'user-vet-c2', { name: 'Intruso' });
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('e) Borrado lógico y revocación atómica de sesiones (RF-13)', () => {
    it('debe aplicar borrado lógico marcando deletedAt = now(), isActive = false y revocando sesiones en BD', async () => {
      const result = await usersService.softDelete(CLINIC_1, 'user-vet-1');
      assert.strictEqual(result.success, true);

      const userInDb = usersDb.find((u) => u.id === 'user-vet-1');
      assert.ok(userInDb);
      assert.strictEqual(userInDb.isActive, false);
      assert.ok(userInDb.deletedAt instanceof Date);

      // Verificación de revocación atómica de refresh tokens en BD (RF-13)
      assert.ok(
        revokedUserIds.includes('user-vet-1'),
        'Debe invocar tokenRevocationService.revokeUserRefreshTokens(userId)',
      );
    });

    it('un usuario con borrado lógico no debe aparecer en findAll() ni en findById()', async () => {
      await usersService.softDelete(CLINIC_1, 'user-rec-1');

      const all = await usersService.findAll(CLINIC_1);
      const foundInList = all.some((u: any) => u.id === 'user-rec-1');
      assert.strictEqual(foundInList, false);

      await assert.rejects(
        async () => {
          await usersService.findById(CLINIC_1, 'user-rec-1');
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });

    it('debe rechazar con HTTP 404 Not Found al intentar eliminar un usuario inexistente o de otra clínica', async () => {
      await assert.rejects(
        async () => {
          await usersService.softDelete(CLINIC_1, 'user-vet-c2');
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('f) Aislamiento multi-tenant por clínica (RF-9, RNF-8)', () => {
    it('findAll solo debe retornar colaboradores de la clínica especificada', async () => {
      const clinic1Users = await usersService.findAll(CLINIC_1);
      assert.ok(clinic1Users.length > 0);
      assert.ok(clinic1Users.every((u: any) => u.clinicId === CLINIC_1));
      assert.ok(
        !clinic1Users.some((u: any) => u.id === 'user-deleted-1'),
        'No debe retornar colaboradores desvinculados (deletedAt != null)',
      );

      const clinic2Users = await usersService.findAll(CLINIC_2);
      assert.ok(clinic2Users.length > 0);
      assert.ok(clinic2Users.every((u: any) => u.clinicId === CLINIC_2));
    });

    it('findById debe rechazar con 404 al solicitar un usuario de otra clínica', async () => {
      await assert.rejects(
        async () => {
          await usersService.findById(CLINIC_1, 'user-vet-c2');
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('g) Integración de UsersController con decoradores RBAC y Multi-tenant', () => {
    it('POST /users debe estar protegido para ADMIN y delegar con clinicId extraído', async () => {
      const rolesMeta = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.create);
      assert.deepStrictEqual(rolesMeta, [Role.ADMIN]);

      const dto: CreateUserDto = {
        name: 'Recepcionista Controller',
        email: 'rec-controller@clinic1.com',
        password: 'Password123!',
        role: Role.RECEPTION,
      };

      const result = await usersController.create(CLINIC_1, dto);
      assert.strictEqual(result.email, 'rec-controller@clinic1.com');
      assert.strictEqual(result.clinicId, CLINIC_1);
    });

    it('GET /users debe delegar a findAll con clinicId', async () => {
      const list = await usersController.findAll(CLINIC_1);
      assert.ok(Array.isArray(list));
      assert.ok(list.every((u) => u.clinicId === CLINIC_1));
    });

    it('GET /users/:id debe delegar a findById con clinicId e id', async () => {
      const user = await usersController.findById(CLINIC_1, 'user-admin-1');
      assert.strictEqual(user.id, 'user-admin-1');
    });

    it('PATCH /users/:id debe tener @Roles(ADMIN) y delegar a update', async () => {
      const rolesMeta = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.update);
      assert.deepStrictEqual(rolesMeta, [Role.ADMIN]);

      const updated = await usersController.update(CLINIC_1, 'user-admin-1', {
        name: 'Administrador Renombrado',
      });
      assert.strictEqual(updated.name, 'Administrador Renombrado');
    });

    it('DELETE /users/:id debe tener @Roles(ADMIN) y delegar a softDelete', async () => {
      const rolesMeta = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.softDelete);
      assert.deepStrictEqual(rolesMeta, [Role.ADMIN]);

      const res = await usersController.softDelete(CLINIC_1, 'user-admin-1');
      assert.strictEqual(res.success, true);
    });
  });
});
