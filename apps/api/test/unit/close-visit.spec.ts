import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, VisitStatus } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { VisitsService } from '../../src/modules/visits/visits.service';
import { VisitsController } from '../../src/modules/visits/visits.controller';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';
import { VitalsValidator } from '../../src/modules/visits/vitals.validator';
import { AttendVisitDto } from '../../src/modules/visits/dto/attend-visit.dto';

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
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  capillaryRefillTime: number | null;
  scheduledDate: Date;
  durationMinutes: number;
  status: VisitStatus;
  cancellationReason: string | null;
  closedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pet?: MockPet;
  veterinarian?: MockVet;
}

describe('CloseVisit & Medical Immutability - T20 (RF-45, RF-3)', () => {
  let visitsService: VisitsService;
  let visitsController: VisitsController;
  let collisionValidator: CollisionValidator;
  let vitalsValidator: VitalsValidator;

  const validClinicId = '11111111-1111-4111-8111-111111111111';
  const otherClinicId = '99999999-9999-4999-8999-999999999999';
  const validPetId = '22222222-2222-4222-8222-222222222222';
  const validVetId = '33333333-3333-4333-8333-333333333333';
  const validVisitId = '44444444-4444-4444-8444-444444444444';

  let mockPets: MockPet[];
  let mockUsers: MockVet[];
  let mockVisits: MockVisit[];
  let mockPrisma: any;

  beforeEach(() => {
    vitalsValidator = new VitalsValidator();
    collisionValidator = new CollisionValidator();

    mockPets = [
      {
        id: validPetId,
        name: 'Rocky',
        deletedAt: null,
      },
    ];

    mockUsers = [
      {
        id: validVetId,
        name: 'Dra. Elena Veterinaria',
        role: Role.VET,
        isActive: true,
        deletedAt: null,
      },
    ];

    mockVisits = [
      {
        id: validVisitId,
        clinicId: validClinicId,
        vetId: validVetId,
        petId: validPetId,
        reason: 'Atención clínica por claudicación',
        notes: 'Paciente con dolor en miembro anterior izquierdo.',
        diagnosis: 'Esguince articular grado I.',
        treatment: 'Reposo y antiinflamatorio no esteroideo.',
        weight: 18.0,
        temperature: 38.4,
        heartRate: 98,
        respiratoryRate: 22,
        capillaryRefillTime: 2,
        scheduledDate: new Date('2026-10-25T14:00:00.000Z'),
        durationMinutes: 30,
        status: VisitStatus.SCHEDULED,
        cancellationReason: null,
        closedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma = {
      visit: {
        findFirst: async ({ where }: any) => {
          const found = mockVisits.find((v) => {
            if (where.id && v.id !== where.id) return false;
            if (where.clinicId && v.clinicId !== where.clinicId) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            return true;
          });
          if (!found) return null;
          return {
            ...found,
            pet: mockPets.find((p) => p.id === found.petId),
            veterinarian: mockUsers.find((u) => u.id === found.vetId),
          };
        },
        update: async ({ where, data }: any) => {
          const index = mockVisits.findIndex((v) => v.id === where.id);
          if (index === -1) {
            throw new Error('Visit not found');
          }
          mockVisits[index] = {
            ...mockVisits[index],
            ...data,
            updatedAt: new Date(),
          };
          return {
            ...mockVisits[index],
            pet: mockPets.find((p) => p.id === mockVisits[index].petId),
            veterinarian: mockUsers.find((u) => u.id === mockVisits[index].vetId),
          };
        },
      },
    };

    visitsService = new VisitsService(mockPrisma, collisionValidator, vitalsValidator);
    visitsController = new VisitsController(visitsService);
  });

  describe('1. Cierre formal de la visita médica (RF-45)', () => {
    it('debe cerrar formalmente la visita fijando closedAt con marca de tiempo actual (RF-45)', async () => {
      const beforeClose = new Date();
      const closedVisit = await visitsService.closeVisit(
        validClinicId,
        validVisitId,
        validVetId,
      );
      const afterClose = new Date();

      assert.strictEqual(closedVisit.id, validVisitId);
      assert.notStrictEqual(closedVisit.closedAt, null);
      assert.strictEqual(closedVisit.closedAt instanceof Date, true);
      assert.strictEqual(
        (closedVisit.closedAt as Date).getTime() >= beforeClose.getTime(),
        true,
      );
      assert.strictEqual(
        (closedVisit.closedAt as Date).getTime() <= afterClose.getTime(),
        true,
      );
    });

    it('debe rechazar con HTTP 409 Conflict si la visita ya se encuentra cerrada', async () => {
      mockVisits[0].closedAt = new Date('2026-10-25T15:00:00.000Z');

      await assert.rejects(
        async () => {
          await visitsService.closeVisit(validClinicId, validVisitId, validVetId);
        },
        (err: any) => {
          assert.strictEqual(err instanceof ConflictException, true);
          assert.strictEqual(
            err.message,
            'La visita médica ya se encuentra cerrada',
          );
          return true;
        },
      );
    });

    it('debe rechazar con HTTP 409 Conflict si la visita está cancelada', async () => {
      mockVisits[0].status = VisitStatus.CANCELLED;

      await assert.rejects(
        async () => {
          await visitsService.closeVisit(validClinicId, validVisitId, validVetId);
        },
        (err: any) => {
          assert.strictEqual(err instanceof ConflictException, true);
          assert.strictEqual(
            err.message,
            'No se puede cerrar una visita cancelada',
          );
          return true;
        },
      );
    });

    it('debe rechazar con HTTP 404 Not Found si la visita no existe o es de otra clínica', async () => {
      await assert.rejects(
        async () => {
          await visitsService.closeVisit(otherClinicId, validVisitId, validVetId);
        },
        (err: any) => {
          assert.strictEqual(err instanceof NotFoundException, true);
          assert.strictEqual(err.message, 'Visita no encontrada');
          return true;
        },
      );
    });
  });

  describe('2. Inmutabilidad clínica: Bloqueo de modificaciones tras cierre (RF-45)', () => {
    it('debe bloquear cualquier intento de modificación de datos médicos con HTTP 403 Forbidden (RF-45)', async () => {
      // 1. Cerrar la visita
      await visitsService.closeVisit(validClinicId, validVisitId, validVetId);

      // 2. Intentar modificar notas, diagnóstico o constantes
      const modificationDto: AttendVisitDto = {
        notes: 'Modificación maliciosa posterior al cierre',
        diagnosis: 'Diagnóstico alterado',
        weight: 20.0,
      };

      await assert.rejects(
        async () => {
          await visitsService.attendVisit(
            validClinicId,
            validVisitId,
            validVetId,
            modificationDto,
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof ForbiddenException, true);
          assert.strictEqual(
            err.message,
            'No se puede modificar una visita médica que ya ha sido cerrada formalmente',
          );
          return true;
        },
      );
    });
  });

  describe('3. Control de acceso RBAC y delegación en VisitsController (RF-3, RF-45)', () => {
    it('PATCH /visits/:id/attend debe estar restringido exclusivamente a VET (@Roles(Role.VET))', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VisitsController.prototype.attend);
      assert.deepStrictEqual(roles, [Role.VET]);
    });

    it('POST /visits/:id/close debe estar restringido exclusivamente a VET (@Roles(Role.VET))', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VisitsController.prototype.close);
      assert.deepStrictEqual(roles, [Role.VET]);
    });

    it('VisitsController.attend debe delegar a visitsService.attendVisit con clinicId, id, userId y dto', async () => {
      let delegatedClinicId = '';
      let delegatedVisitId = '';
      let delegatedVetId = '';
      let delegatedDto: any = null;

      visitsService.attendVisit = async (clinicId, visitId, vetId, dto) => {
        delegatedClinicId = clinicId;
        delegatedVisitId = visitId;
        delegatedVetId = vetId;
        delegatedDto = dto;
        return mockVisits[0] as any;
      };

      const attendDto: AttendVisitDto = {
        notes: 'Atención realizada',
        diagnosis: 'Sano',
        treatment: 'Ninguno',
      };

      const mockReq = {
        user: {
          userId: validVetId,
          clinicId: validClinicId,
          role: Role.VET,
        },
      };

      await visitsController.attend(validClinicId, validVisitId, mockReq as any, attendDto);

      assert.strictEqual(delegatedClinicId, validClinicId);
      assert.strictEqual(delegatedVisitId, validVisitId);
      assert.strictEqual(delegatedVetId, validVetId);
      assert.deepStrictEqual(delegatedDto, attendDto);
    });

    it('VisitsController.close debe delegar a visitsService.closeVisit con clinicId, id y userId', async () => {
      let delegatedClinicId = '';
      let delegatedVisitId = '';
      let delegatedVetId = '';

      visitsService.closeVisit = async (clinicId, visitId, vetId) => {
        delegatedClinicId = clinicId;
        delegatedVisitId = visitId;
        delegatedVetId = vetId;
        return mockVisits[0] as any;
      };

      const mockReq = {
        user: {
          userId: validVetId,
          clinicId: validClinicId,
          role: Role.VET,
        },
      };

      await visitsController.close(validClinicId, validVisitId, mockReq as any);

      assert.strictEqual(delegatedClinicId, validClinicId);
      assert.strictEqual(delegatedVisitId, validVisitId);
      assert.strictEqual(delegatedVetId, validVetId);
    });
  });
});
