import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClinicsService } from '../../src/modules/clinics/clinics.service';
import { ClinicsController } from '../../src/modules/clinics/clinics.controller';
import {
  CurrentClinic,
  CurrentClinicId,
  extractClinicIdFromRequest,
} from '../../src/common/decorators/clinic.decorator';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { CreateClinicDto } from '../../src/modules/clinics/dto/create-clinic.dto';
import { UpdateClinicDto } from '../../src/modules/clinics/dto/update-clinic.dto';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ClinicsService & ClinicsController (T10 / RF-7, RF-8, RF-9, RNF-8)', () => {
  let clinicsService: ClinicsService;
  let clinicsController: ClinicsController;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      clinic: {
        findUnique: async () => null,
        findFirst: async () => null,
        create: async (args: any) => ({
          id: 'clinic-uuid-1',
          name: args.data.name,
          code: args.data.code,
          phone: args.data.phone ?? null,
          email: args.data.email ?? null,
          address: args.data.address ?? null,
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: async (args: any) => ({
          id: args.where.id,
          name: args.data.name ?? 'Clínica Veterinaria Mock',
          code: 'clinic-01',
          phone: args.data.phone ?? null,
          email: args.data.email ?? null,
          address: args.data.address ?? null,
          isActive: args.data.isActive ?? true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };

    clinicsService = new ClinicsService(mockPrisma as unknown as PrismaService);
    clinicsController = new ClinicsController(clinicsService);
  });

  describe('a) Registro de clínica por ADMIN con code normalizado (RF-7)', () => {
    it('debe crear la clínica normalizando el código alfanumérico a minúsculas y recortando espacios', async () => {
      let createdData: any = null;
      mockPrisma.clinic.create = async (args: any) => {
        createdData = args.data;
        return {
          id: 'clinic-uuid-1',
          ...args.data,
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };

      const dto: CreateClinicDto = {
        name: '  Clínica Veterinaria San Francisco  ',
        code: '  CLINIC-SAN-FRAN-01  ',
        phone: '+593991234567',
        email: 'info@sanfrancisco.vet',
        address: 'Av. Siempre Viva 123',
      };

      const result = await clinicsService.create(dto);

      assert.ok(result);
      assert.strictEqual(result.name, 'Clínica Veterinaria San Francisco');
      assert.strictEqual(result.code, 'clinic-san-fran-01');
      assert.strictEqual(createdData.code, 'clinic-san-fran-01');
      assert.strictEqual(createdData.name, 'Clínica Veterinaria San Francisco');
    });

    it('debe registrar clínica con campos opcionales nulos si no son proporcionados', async () => {
      let createdData: any = null;
      mockPrisma.clinic.create = async (args: any) => {
        createdData = args.data;
        return {
          id: 'clinic-uuid-minimal',
          ...args.data,
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };

      const dto: CreateClinicDto = {
        name: 'Clínica Básica',
        code: 'basic-clinic',
      };

      const result = await clinicsService.create(dto);

      assert.strictEqual(result.code, 'basic-clinic');
      assert.strictEqual(createdData.phone, null);
      assert.strictEqual(createdData.email, null);
      assert.strictEqual(createdData.address, null);
    });

    it('el endpoint POST /clinics en ClinicsController debe estar restringido a ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClinicsController.prototype.create);
      assert.deepStrictEqual(roles, [Role.ADMIN]);
    });
  });

  describe('b) Rechazo con HTTP 409 Conflict ante colisión de code duplicado (RF-8)', () => {
    it('debe lanzar ConflictException si ya existe una clínica con el mismo código normalizado', async () => {
      mockPrisma.clinic.findUnique = async (args: any) => {
        if (args.where.code === 'clinic-01') {
          return {
            id: 'existing-clinic-id',
            code: 'clinic-01',
            name: 'Clínica Existente',
          };
        }
        return null;
      };

      const dto: CreateClinicDto = {
        name: 'Segunda Clínica',
        code: '  CLINIC-01  ',
      };

      await assert.rejects(
        async () => {
          await clinicsService.create(dto);
        },
        (error: any) => {
          assert.ok(error instanceof ConflictException);
          assert.match(error.message, /clinic-01/);
          return true;
        },
      );
    });
  });

  describe('c) Extracción determinista de clinicId con @CurrentClinic() sin depender del body (RF-9, RNF-8)', () => {
    it('extractClinicIdFromRequest debe extraer clinicId exclusivamente de request.user', () => {
      const mockRequest = {
        user: {
          clinicId: 'trusted-token-clinic-id',
          userId: 'user-uuid-1',
          email: 'vet@example.com',
          role: Role.VET,
        },
        body: {
          clinicId: 'malicious-injected-clinic-id', // Intento de spoofing en body
        },
        query: {
          clinicId: 'query-injected-clinic-id', // Intento de spoofing en query
        },
      };

      const extracted = extractClinicIdFromRequest(mockRequest as any);

      assert.strictEqual(extracted, 'trusted-token-clinic-id');
      assert.notStrictEqual(extracted, 'malicious-injected-clinic-id');
      assert.notStrictEqual(extracted, 'query-injected-clinic-id');
    });

    it('debe lanzar UnauthorizedException si request.user no contiene clinicId o no está autenticado', () => {
      const mockRequestNoUser = {
        body: { clinicId: 'some-clinic-id' },
      };

      assert.throws(
        () => extractClinicIdFromRequest(mockRequestNoUser as any),
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.match(err.message, /Identificador de clínica no encontrado/);
          return true;
        },
      );

      const mockRequestEmptyClinic = {
        user: {
          userId: 'user-uuid-1',
        },
      };

      assert.throws(
        () => extractClinicIdFromRequest(mockRequestEmptyClinic as any),
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          return true;
        },
      );
    });

    it('los decoradores @CurrentClinic y @CurrentClinicId deben estar definidos como funciones de Nest', () => {
      assert.strictEqual(typeof CurrentClinic, 'function');
      assert.strictEqual(typeof CurrentClinicId, 'function');
    });
  });

  describe('d) Consulta y actualización de clínica actual (GET /clinics/current, PATCH /clinics/current)', () => {
    it('findCurrentClinic debe retornar los datos de la clínica del usuario autenticado', async () => {
      const expectedClinic = {
        id: 'clinic-current-uuid',
        name: 'Clínica Central',
        code: 'clinic-central',
        phone: '+59399111222',
        email: 'central@vetapp.com',
        address: 'Calle 10 y Av. 5',
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.clinic.findFirst = async (args: any) => {
        if (args.where.id === 'clinic-current-uuid' && args.where.deletedAt === null) {
          return expectedClinic;
        }
        return null;
      };

      const result = await clinicsService.findCurrentClinic('clinic-current-uuid');
      assert.deepStrictEqual(result, expectedClinic);
    });

    it('findCurrentClinic debe lanzar NotFoundException si la clínica no existe o está eliminada', async () => {
      mockPrisma.clinic.findFirst = async () => null;

      await assert.rejects(
        async () => {
          await clinicsService.findCurrentClinic('non-existent-id');
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.match(err.message, /no encontrada/);
          return true;
        },
      );
    });

    it('update debe modificar datos de la clínica tras validar existencia previa', async () => {
      mockPrisma.clinic.findFirst = async () => ({
        id: 'clinic-uuid-1',
        name: 'Nombre Antiguo',
        code: 'clinic-01',
        deletedAt: null,
      });

      let updatePayload: any = null;
      mockPrisma.clinic.update = async (args: any) => {
        updatePayload = args;
        return {
          id: args.where.id,
          name: args.data.name,
          phone: args.data.phone,
          code: 'clinic-01',
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };

      const updateDto: UpdateClinicDto = {
        name: '  Nombre Actualizado  ',
        phone: '+1234567890',
      };

      const updated = await clinicsService.update('clinic-uuid-1', updateDto);

      assert.strictEqual(updated.name, 'Nombre Actualizado');
      assert.strictEqual(updatePayload.where.id, 'clinic-uuid-1');
      assert.strictEqual(updatePayload.data.name, 'Nombre Actualizado');
      assert.strictEqual(updatePayload.data.phone, '+1234567890');
    });

    it('ClinicsController debe delegar llamadas adecuadamente a ClinicsService', async () => {
      mockPrisma.clinic.findFirst = async () => ({
        id: 'clinic-uuid-controller',
        name: 'Clínica Controller',
        code: 'clinic-ctrl',
        deletedAt: null,
      });

      const current = await clinicsController.findCurrent('clinic-uuid-controller');
      assert.strictEqual(current.id, 'clinic-uuid-controller');

      const byId = await clinicsController.findById('clinic-uuid-controller');
      assert.strictEqual(byId.id, 'clinic-uuid-controller');

      const updated = await clinicsController.updateCurrent('clinic-uuid-controller', {
        name: 'Nuevo Nombre',
      });
      assert.ok(updated);
    });

    it('el endpoint PATCH /clinics/current en ClinicsController debe estar restringido a ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClinicsController.prototype.updateCurrent);
      assert.deepStrictEqual(roles, [Role.ADMIN]);
    });

    it('el endpoint GET /clinics/:id en ClinicsController debe estar restringido a ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClinicsController.prototype.findById);
      assert.deepStrictEqual(roles, [Role.ADMIN]);
    });
  });
});
