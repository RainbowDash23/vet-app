import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role, VisitStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { VisitsService } from '../../src/modules/visits/visits.service';
import { VisitsController } from '../../src/modules/visits/visits.controller';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';
import { CancelVisitDto } from '../../src/modules/visits/dto/cancel-visit.dto';
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
  cancellationReason: string | null;
  closedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pet?: MockPet;
  veterinarian?: MockVet;
}

describe('CancelVisit - T19 (RF-41, RF-42)', () => {
  let visitsService: VisitsService;
  let visitsController: VisitsController;
  let collisionValidator: CollisionValidator;

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
    mockPets = [
      {
        id: validPetId,
        name: 'Firulais',
        deletedAt: null,
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
    ];

    mockVisits = [
      {
        id: validVisitId,
        clinicId: validClinicId,
        vetId: validVetId,
        petId: validPetId,
        reason: 'Consulta general de rutina',
        scheduledDate: new Date('2026-10-25T10:00:00.000Z'),
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
      pet: {
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockPets.find((p) => {
              if (where.id && p.id !== where.id) return false;
              if (where.deletedAt === null && p.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
      user: {
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockUsers.find((u) => {
              if (where.id && u.id !== where.id) return false;
              if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
              if (where.deletedAt === null && u.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
      visit: {
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockVisits.find((v) => {
              if (where.id && v.id !== where.id) return false;
              if (where.clinicId && v.clinicId !== where.clinicId) return false;
              if (where.deletedAt === null && v.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
        findMany: async ({ where }: { where: any }) => {
          return mockVisits.filter((v) => {
            if (where.clinicId && v.clinicId !== where.clinicId) return false;
            if (where.vetId && v.vetId !== where.vetId) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            if (where.status && where.status.in && !where.status.in.includes(v.status)) return false;
            return true;
          });
        },
        create: async ({ data, include }: { data: any; include?: any }) => {
          const newVisit: MockVisit = {
            id: '55555555-5555-4555-8555-555555555555',
            clinicId: data.clinicId,
            vetId: data.vetId,
            petId: data.petId,
            reason: data.reason,
            scheduledDate: data.scheduledDate,
            durationMinutes: data.durationMinutes ?? 30,
            status: data.status ?? VisitStatus.SCHEDULED,
            cancellationReason: null,
            closedAt: null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockVisits.push(newVisit);
          return {
            ...newVisit,
            pet: include?.pet ? mockPets.find((p) => p.id === newVisit.petId) : undefined,
            veterinarian: include?.veterinarian
              ? mockUsers.find((u) => u.id === newVisit.vetId)
              : undefined,
          };
        },
        update: async ({ where, data, include }: { where: any; data: any; include?: any }) => {
          const index = mockVisits.findIndex((v) => v.id === where.id);
          if (index === -1) throw new Error('Not found in update mock');
          mockVisits[index] = {
            ...mockVisits[index],
            ...data,
            updatedAt: new Date(),
          };
          const updated = mockVisits[index];
          return {
            ...updated,
            pet: include?.pet ? mockPets.find((p) => p.id === updated.petId) : undefined,
            veterinarian: include?.veterinarian
              ? mockUsers.find((u) => u.id === updated.vetId)
              : undefined,
          };
        },
      },
    };

    collisionValidator = new CollisionValidator();
    visitsService = new VisitsService(mockPrisma as any, collisionValidator);
    visitsController = new VisitsController(visitsService);
  });

  describe('1. Validación de DTO CancelVisitDto (RF-41, RF-42)', () => {
    it('debe ser válido con un motivo de cancelación con 10 o más caracteres', async () => {
      const dto = plainToInstance(CancelVisitDto, {
        cancellationReason: 'El cliente cancela con anticipación por viaje familiar',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('debe fallar si cancellationReason está ausente (RF-42)', async () => {
      const dto = plainToInstance(CancelVisitDto, {});
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((err) => err.property === 'cancellationReason'));
    });

    it('debe fallar si cancellationReason es una cadena vacía (RF-42)', async () => {
      const dto = plainToInstance(CancelVisitDto, {
        cancellationReason: '',
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((err) => err.property === 'cancellationReason'));
    });

    it('debe fallar si cancellationReason contiene menos de 10 caracteres (RF-42)', async () => {
      const dto = plainToInstance(CancelVisitDto, {
        cancellationReason: 'Corto',
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((err) => err.property === 'cancellationReason'));
    });

    it('debe fallar si cancellationReason excede los 500 caracteres', async () => {
      const dto = plainToInstance(CancelVisitDto, {
        cancellationReason: 'a'.repeat(501),
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((err) => err.property === 'cancellationReason'));
    });
  });

  describe('2. Cancelación exitosa de visita (RF-41)', () => {
    it('debe actualizar el estado a CANCELLED y registrar el motivo de cancelación', async () => {
      const cancelDto: CancelVisitDto = {
        cancellationReason: 'El paciente fue llevado a urgencias por otro centro',
      };

      const result = await visitsService.cancelVisit(validClinicId, validVisitId, cancelDto);

      assert.strictEqual(result.id, validVisitId);
      assert.strictEqual(result.status, VisitStatus.CANCELLED);
      assert.strictEqual(
        result.cancellationReason,
        'El paciente fue llevado a urgencias por otro centro',
      );

      // Comprobar que en memoria quedó en CANCELLED
      const visitInDb = mockVisits.find((v) => v.id === validVisitId);
      assert.strictEqual(visitInDb?.status, VisitStatus.CANCELLED);
      assert.strictEqual(
        visitInDb?.cancellationReason,
        'El paciente fue llevado a urgencias por otro centro',
      );
    });
  });

  describe('3. Liberación de la agenda del veterinario (RF-41)', () => {
    it('debe permitir agendar en el mismo horario una vez que la visita previa fue cancelada', async () => {
      // 1. Intentar agendar en el mismo horario mientras la visita inicial está SCHEDULED -> debe colisionar
      const conflictingDto: CreateVisitDto = {
        petId: validPetId,
        vetId: validVetId,
        scheduledDate: '2026-10-25T10:00:00.000Z',
        durationMinutes: 30,
        reason: 'Control cardiológico urgente',
      };

      await assert.rejects(
        async () => {
          await visitsService.scheduleVisit(validClinicId, conflictingDto);
        },
        (err: any) => {
          assert.ok(err instanceof ConflictException);
          assert.match(err.message, /solapamiento/i);
          return true;
        },
      );

      // 2. Cancelar la visita previa con motivo obligatorio
      await visitsService.cancelVisit(validClinicId, validVisitId, {
        cancellationReason: 'El propietario avisa que no podrá asistir a la cita',
      });

      // 3. Reintentar agendar en el mismo horario -> Ahora la agenda está liberada y debe agendarse con éxito
      const newVisit = await visitsService.scheduleVisit(validClinicId, conflictingDto);
      assert.ok(newVisit);
      assert.strictEqual(newVisit.status, VisitStatus.SCHEDULED);
      assert.strictEqual(newVisit.reason, 'Control cardiológico urgente');
    });
  });

  describe('4. Rechazos y validaciones de estado y pertenencia (HTTP 404 & 409)', () => {
    it('debe lanzar NotFoundException (HTTP 404) si la visita no existe', async () => {
      await assert.rejects(
        async () => {
          await visitsService.cancelVisit(validClinicId, '00000000-0000-4000-8000-000000000000', {
            cancellationReason: 'Motivo de prueba con longitud válida',
          });
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Visita no encontrada');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException (HTTP 404) si la visita pertenece a otra clínica', async () => {
      await assert.rejects(
        async () => {
          await visitsService.cancelVisit(otherClinicId, validVisitId, {
            cancellationReason: 'Motivo de prueba con longitud válida',
          });
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Visita no encontrada');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException (HTTP 404) si la visita tiene borrado lógico', async () => {
      const visitInDb = mockVisits.find((v) => v.id === validVisitId)!;
      visitInDb.deletedAt = new Date();

      await assert.rejects(
        async () => {
          await visitsService.cancelVisit(validClinicId, validVisitId, {
            cancellationReason: 'Motivo de prueba con longitud válida',
          });
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Visita no encontrada');
          return true;
        },
      );
    });

    it('debe lanzar ConflictException (HTTP 409) si la visita ya está cerrada (RF-45)', async () => {
      const visitInDb = mockVisits.find((v) => v.id === validVisitId)!;
      visitInDb.closedAt = new Date();

      await assert.rejects(
        async () => {
          await visitsService.cancelVisit(validClinicId, validVisitId, {
            cancellationReason: 'Intento de cancelar una consulta médica ya cerrada',
          });
        },
        (err: any) => {
          assert.ok(err instanceof ConflictException);
          assert.strictEqual(
            err.message,
            'No se puede cancelar una visita médica que ya ha sido cerrada',
          );
          return true;
        },
      );
    });

    it('debe lanzar ConflictException (HTTP 409) si la visita ya se encuentra cancelada', async () => {
      const visitInDb = mockVisits.find((v) => v.id === validVisitId)!;
      visitInDb.status = VisitStatus.CANCELLED;
      visitInDb.cancellationReason = 'Cancelada previamente por el dueño';

      await assert.rejects(
        async () => {
          await visitsService.cancelVisit(validClinicId, validVisitId, {
            cancellationReason: 'Intento de re-cancelar la misma cita',
          });
        },
        (err: any) => {
          assert.ok(err instanceof ConflictException);
          assert.strictEqual(err.message, 'La visita ya se encuentra cancelada');
          return true;
        },
      );
    });
  });

  describe('5. VisitsController: Integración de PATCH /visits/:id/cancel y RBAC (RF-41)', () => {
    it('el método cancel debe contar con decorador @Roles(Role.RECEPTION, Role.ADMIN, Role.VET)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VisitsController.prototype.cancel);
      assert.deepStrictEqual(roles, [Role.RECEPTION, Role.ADMIN, Role.VET]);
    });

    it('VisitsController.cancel debe delegar correctamente a visitsService.cancelVisit', async () => {
      const cancelDto: CancelVisitDto = {
        cancellationReason: 'Cancelación gestionada desde recepción por teléfono',
      };

      const result = await visitsController.cancel(validClinicId, validVisitId, cancelDto);

      assert.strictEqual(result.id, validVisitId);
      assert.strictEqual(result.status, VisitStatus.CANCELLED);
      assert.strictEqual(
        result.cancellationReason,
        'Cancelación gestionada desde recepción por teléfono',
      );
    });
  });
});
