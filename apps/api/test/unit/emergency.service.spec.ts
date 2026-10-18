import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { NotFoundException } from '@nestjs/common';
import { AccessAction, TagStatus } from '@prisma/client';
import { PetSpecies } from '@vet-app/shared-types';
import { EmergencyService } from '../../src/modules/emergency/emergency.service';
import { EmergencyController } from '../../src/modules/emergency/emergency.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';

interface MockOwner {
  id: string;
  name: string;
  lastName: string;
  phone: string;
  address: string | null;
  documentId: string | null;
  deletedAt: Date | null;
}

interface MockPet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  notes: string | null;
  ownerId: string;
  deletedAt: Date | null;
  owner: MockOwner;
  visits?: Array<{
    id: string;
    clinicId: string;
    diagnosis?: string;
    clinic: {
      id: string;
      name: string;
      phone: string | null;
    };
  }>;
  accessGrants?: Array<{
    id: string;
    clinicId: string;
    clinic: {
      id: string;
      name: string;
      phone: string | null;
    };
  }>;
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

describe('EmergencyService & EmergencyController (T17 / RF-35, RF-36, RF-37, RF-38)', () => {
  let emergencyService: EmergencyService;
  let emergencyController: EmergencyController;
  let mockPrisma: any;
  let mockAccessLogsService: any;

  const validPublicCode = '11111111-2222-4444-8888-999999999999';
  const invalidUuidCode = 'not-a-valid-uuid-code';
  const sampleIp = '203.0.113.195';
  const sampleUserAgent = 'Mozilla/5.0 (Emergency Citizen Scanner)';

  const sampleOwner: MockOwner = {
    id: 'owner-uuid-1',
    name: 'Carlos',
    lastName: 'Santana',
    phone: '+593991234567',
    address: 'Av. Secreta 123, Calle Prohibida',
    documentId: '1712345678',
    deletedAt: null,
  };

  const samplePet: MockPet = {
    id: 'pet-uuid-1',
    name: 'Firulais',
    species: PetSpecies.CANINE,
    breed: 'Golden Retriever',
    notes: 'Alergia severa a penicilinas y notas médicas confidenciales',
    ownerId: sampleOwner.id,
    deletedAt: null,
    owner: sampleOwner,
    visits: [
      {
        id: 'visit-uuid-1',
        clinicId: 'clinic-uuid-1',
        diagnosis: 'Dermatitis atópica',
        clinic: {
          id: 'clinic-uuid-1',
          name: 'Clínica Veterinaria San Roque',
          phone: '+59322987654',
        },
      },
    ],
  };

  const sampleTag: MockTag = {
    id: 'tag-uuid-1',
    uid: '04A1B2C3D4E5F6',
    publicCode: validPublicCode,
    status: TagStatus.ACTIVE,
    petId: samplePet.id,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    pet: samplePet,
  };

  beforeEach(() => {
    mockPrisma = {
      tag: {
        findFirst: async () => null,
      },
      clinic: {
        findFirst: async () => ({
          id: 'clinic-uuid-default',
          name: 'Hospital Veterinario de Urgencias',
          phone: '+59322112233',
        }),
      },
    };

    mockAccessLogsService = {
      loggedItems: [] as any[],
      log: async (data: any) => {
        mockAccessLogsService.loggedItems.push({
          id: 'access-log-uuid-test',
          ...data,
          timestamp: new Date(),
        });
        return {
          id: 'access-log-uuid-test',
          ...data,
          timestamp: new Date(),
        };
      },
    };

    emergencyService = new EmergencyService(mockPrisma as any, mockAccessLogsService as any);
    emergencyController = new EmergencyController(emergencyService);
  });

  describe('a) Endpoint público accesible sin token JWT (RF-35)', () => {
    it('EmergencyController y el método getEmergencyProfile no deben tener guards de autenticación ni RBAC', () => {
      const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, EmergencyController);
      const methodGuards = Reflect.getMetadata(GUARDS_METADATA, EmergencyController.prototype.getEmergencyProfile);

      assert.strictEqual(controllerGuards, undefined, 'EmergencyController no debe tener guards a nivel de clase');
      assert.strictEqual(methodGuards, undefined, 'getEmergencyProfile no debe tener guards a nivel de método');
    });
  });

  describe('b) Serialización estricta y restricción absoluta de datos médicos/privados (RF-36)', () => {
    it('debe exponer exclusivamente petName, species, breed, ownerName, ownerPhone, ownerSecondaryPhone, clinicName, clinicPhone', async () => {
      mockPrisma.tag.findFirst = async () => sampleTag;

      const profile = await emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent);

      assert.strictEqual(profile.petName, 'Firulais');
      assert.strictEqual(profile.species, PetSpecies.CANINE);
      assert.strictEqual(profile.breed, 'Golden Retriever');
      assert.strictEqual(profile.ownerName, 'Carlos Santana');
      assert.strictEqual(profile.ownerPhone, '+593991234567');
      assert.strictEqual(profile.ownerSecondaryPhone, null);
      assert.strictEqual(profile.clinicName, 'Clínica Veterinaria San Roque');
      assert.strictEqual(profile.clinicPhone, '+59322987654');

      const returnedKeys = Object.keys(profile).sort();
      const expectedKeys = [
        'breed',
        'clinicName',
        'clinicPhone',
        'ownerName',
        'ownerPhone',
        'ownerSecondaryPhone',
        'petName',
        'species',
      ].sort();

      assert.deepStrictEqual(returnedKeys, expectedKeys, 'No debe retornar campos extra fuera de la spec');

      // Censura absoluta de datos privados
      const profileAny = profile as any;
      assert.strictEqual(profileAny.id, undefined, 'Prohibido divulgar IDs internos');
      assert.strictEqual(profileAny.petId, undefined, 'Prohibido divulgar petId');
      assert.strictEqual(profileAny.ownerId, undefined, 'Prohibido divulgar ownerId');
      assert.strictEqual(profileAny.clinicId, undefined, 'Prohibido divulgar clinicId');
      assert.strictEqual(profileAny.address, undefined, 'Prohibido divulgar dirección física del dueño');
      assert.strictEqual(profileAny.documentId, undefined, 'Prohibido divulgar documento de identidad del dueño');
      assert.strictEqual(profileAny.notes, undefined, 'Prohibido divulgar notas clínicas');
      assert.strictEqual(profileAny.diagnoses, undefined, 'Prohibido divulgar diagnósticos');
      assert.strictEqual(profileAny.visits, undefined, 'Prohibido divulgar historial de visitas');
    });

    it('debe retornar clinicName por defecto si la mascota no tiene visitas previas registradas', async () => {
      const petWithoutVisits: MockPet = {
        ...samplePet,
        visits: [],
        accessGrants: [],
      };
      const tagWithoutVisits: MockTag = {
        ...sampleTag,
        pet: petWithoutVisits,
      };
      mockPrisma.tag.findFirst = async () => tagWithoutVisits;

      const profile = await emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent);

      assert.strictEqual(profile.clinicName, 'Hospital Veterinario de Urgencias');
      assert.strictEqual(profile.clinicPhone, '+59322112233');
    });
  });

  describe('c) Inserción inmediata de traza en AccessLog (RF-37)', () => {
    it('debe insertar una traza en AccessLog con acción EMERGENCY_SCAN, petId e IP registrada', async () => {
      mockPrisma.tag.findFirst = async () => sampleTag;

      await emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent);

      assert.strictEqual(mockAccessLogsService.loggedItems.length, 1);
      const logEntry = mockAccessLogsService.loggedItems[0];
      assert.strictEqual(logEntry.petId, samplePet.id);
      assert.strictEqual(logEntry.action, AccessAction.EMERGENCY_SCAN);
      assert.strictEqual(logEntry.ipAddress, sampleIp);
      assert.strictEqual(logEntry.userAgent, sampleUserAgent);
      assert.strictEqual(logEntry.clinicId, null);
      assert.strictEqual(logEntry.userId, null);
    });
  });

  describe('d) Respuesta HTTP 404 Not Found ante publicCode inexistente o tag no operativo (RF-38)', () => {
    it('debe lanzar NotFoundException si el publicCode no existe en la base de datos', async () => {
      mockPrisma.tag.findFirst = async () => null;

      await assert.rejects(
        () => emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Código de emergencia no encontrado o inactivo');
          return true;
        },
      );

      assert.strictEqual(mockAccessLogsService.loggedItems.length, 0, 'No debe registrar log si el tag no existe');
    });

    it('debe lanzar NotFoundException si el tag tiene estado LOST, DAMAGED o INACTIVE', async () => {
      for (const nonActiveStatus of [TagStatus.LOST, TagStatus.DAMAGED, TagStatus.INACTIVE]) {
        mockPrisma.tag.findFirst = async (args: any) => {
          if (args.where.status === TagStatus.ACTIVE) return null;
          return { ...sampleTag, status: nonActiveStatus };
        };

        await assert.rejects(
          () => emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent),
          (err: any) => {
            assert.ok(err instanceof NotFoundException);
            assert.strictEqual(err.message, 'Código de emergencia no encontrado o inactivo');
            return true;
          },
        );
      }
    });

    it('debe lanzar NotFoundException si el tag tiene borrado lógico (deletedAt !== null)', async () => {
      mockPrisma.tag.findFirst = async (args: any) => {
        if (args.where.deletedAt === null) return null;
        return { ...sampleTag, deletedAt: new Date() };
      };

      await assert.rejects(
        () => emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('e) Validación de formato UUID de publicCode (RF-38)', () => {
    it('debe lanzar NotFoundException inmediatamente si publicCode no tiene formato UUID v4 válido', async () => {
      await assert.rejects(
        () => emergencyService.getEmergencyProfile(invalidUuidCode, sampleIp, sampleUserAgent),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Código de emergencia no encontrado o inactivo');
          return true;
        },
      );

      assert.strictEqual(mockAccessLogsService.loggedItems.length, 0);
    });
  });

  describe('f) Respuesta HTTP 404 si la mascota está inactiva o con borrado lógico (RF-38)', () => {
    it('debe lanzar NotFoundException si la mascota vinculada fue borrada lógicamente', async () => {
      mockPrisma.tag.findFirst = async () => ({
        ...sampleTag,
        pet: {
          ...samplePet,
          deletedAt: new Date(),
        },
      });

      await assert.rejects(
        () => emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el tag no tiene mascota vinculada', async () => {
      mockPrisma.tag.findFirst = async () => ({
        ...sampleTag,
        petId: null,
        pet: null,
      });

      await assert.rejects(
        () => emergencyService.getEmergencyProfile(validPublicCode, sampleIp, sampleUserAgent),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });
  });

  describe('g) Integración de EmergencyController: captura de IP y delegación al servicio', () => {
    it('debe extraer ipAddress de x-forwarded-for y userAgent del header req y delegar a getEmergencyProfile', async () => {
      let capturedPublicCode = '';
      let capturedIp = '';
      let capturedUserAgent = '';

      emergencyService.getEmergencyProfile = async (code: string, ip?: string, ua?: string) => {
        capturedPublicCode = code;
        capturedIp = ip ?? '';
        capturedUserAgent = ua ?? '';
        return {
          petName: 'Firulais',
          species: PetSpecies.CANINE,
          breed: 'Golden Retriever',
          ownerName: 'Carlos Santana',
          ownerPhone: '+593991234567',
          ownerSecondaryPhone: null,
          clinicName: 'Clínica Veterinaria San Roque',
          clinicPhone: '+59322987654',
        };
      };

      const mockRequest = {
        headers: {
          'x-forwarded-for': '198.51.100.42, 10.0.0.1',
          'user-agent': 'Mozilla/5.0 EmergencyApp',
        },
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
      } as any;

      const result = await emergencyController.getEmergencyProfile(validPublicCode, mockRequest);

      assert.strictEqual(capturedPublicCode, validPublicCode);
      assert.strictEqual(capturedIp, '198.51.100.42');
      assert.strictEqual(capturedUserAgent, 'Mozilla/5.0 EmergencyApp');
      assert.strictEqual(result.petName, 'Firulais');
    });

    it('debe hacer fallback a req.ip si no existe x-forwarded-for', async () => {
      let capturedIp = '';

      emergencyService.getEmergencyProfile = async (code: string, ip?: string, ua?: string) => {
        capturedIp = ip ?? '';
        return {} as any;
      };

      const mockRequest = {
        headers: {},
        ip: '172.16.0.5',
      } as any;

      await emergencyController.getEmergencyProfile(validPublicCode, mockRequest);
      assert.strictEqual(capturedIp, '172.16.0.5');
    });
  });
});
