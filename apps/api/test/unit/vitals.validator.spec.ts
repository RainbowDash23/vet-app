import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Role, VisitStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VitalsValidator } from '../../src/modules/visits/vitals.validator';
import { VisitsService } from '../../src/modules/visits/visits.service';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';
import { AttendVisitDto } from '../../src/modules/visits/dto/attend-visit.dto';
import { RecordVitalsDto } from '../../src/modules/visits/dto/record-vitals.dto';

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

describe('VitalsValidator & AttendVisit - T20 (RF-43, RF-44)', () => {
  let vitalsValidator: VitalsValidator;
  let visitsService: VisitsService;
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
    vitalsValidator = new VitalsValidator();
    collisionValidator = new CollisionValidator();

    mockPets = [
      {
        id: validPetId,
        name: 'Max',
        deletedAt: null,
      },
    ];

    mockUsers = [
      {
        id: validVetId,
        name: 'Dr. Alejandro Veterinario',
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
        reason: 'Revisión periódica y vacunación',
        notes: null,
        diagnosis: null,
        treatment: null,
        weight: null,
        temperature: null,
        heartRate: null,
        respiratoryRate: null,
        capillaryRefillTime: null,
        scheduledDate: new Date('2026-10-25T11:00:00.000Z'),
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
        findFirst: async ({ where }: any) => {
          return mockPets.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.deletedAt === null && p.deletedAt !== null) return false;
            return true;
          }) ?? null;
        },
      },
      user: {
        findFirst: async ({ where }: any) => {
          return mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }) ?? null;
        },
      },
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
  });

  describe('1. VitalsValidator: Validación fisiológica estricta (RF-44)', () => {
    it('debe permitir constantes vitales fisiológicamente válidas', () => {
      assert.doesNotThrow(() => {
        vitalsValidator.validateVitals({
          weight: 25.5,
          temperature: 38.5,
          heartRate: 110,
          respiratoryRate: 24,
          capillaryRefillTime: 2,
        });
      });
    });

    it('debe permitir valores en los límites biológicos exactos', () => {
      // Límites inferiores
      assert.doesNotThrow(() => {
        vitalsValidator.validateVitals({
          weight: 0.05,
          temperature: 32.0,
          heartRate: 30,
          respiratoryRate: 10,
          capillaryRefillTime: 1,
        });
      });

      // Límites superiores
      assert.doesNotThrow(() => {
        vitalsValidator.validateVitals({
          weight: 150.0,
          temperature: 43.0,
          heartRate: 300,
          respiratoryRate: 120,
          capillaryRefillTime: 5,
        });
      });
    });

    it('debe permitir valores no suministrados, nulos o indefinidos (opcionales)', () => {
      assert.doesNotThrow(() => {
        vitalsValidator.validateVitals({});
      });

      assert.doesNotThrow(() => {
        vitalsValidator.validateVitals({
          weight: null,
          temperature: null,
          heartRate: undefined,
        });
      });
    });

    it('debe rechazar peso < 0.05 kg con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ weight: 0.04 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'El peso debe encontrarse entre 0.05 kg y 150.0 kg',
          );
          return true;
        },
      );
    });

    it('debe rechazar peso > 150.0 kg con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ weight: 150.1 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'El peso debe encontrarse entre 0.05 kg y 150.0 kg',
          );
          return true;
        },
      );
    });

    it('debe rechazar temperatura < 32.0 °C con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ temperature: 31.9 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La temperatura corporal debe encontrarse entre 32.0 °C y 43.0 °C',
          );
          return true;
        },
      );
    });

    it('debe rechazar temperatura > 43.0 °C con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ temperature: 43.1 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La temperatura corporal debe encontrarse entre 32.0 °C y 43.0 °C',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia cardíaca < 30 lpm con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ heartRate: 29 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia cardíaca debe encontrarse entre 30 y 300 lpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia cardíaca > 300 lpm con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ heartRate: 301 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia cardíaca debe encontrarse entre 30 y 300 lpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia cardíaca con decimales con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ heartRate: 85.5 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia cardíaca debe encontrarse entre 30 y 300 lpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia respiratoria < 10 rpm con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ respiratoryRate: 9 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia respiratoria debe encontrarse entre 10 y 120 rpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia respiratoria > 120 rpm con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ respiratoryRate: 121 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia respiratoria debe encontrarse entre 10 y 120 rpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar frecuencia respiratoria con decimales con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ respiratoryRate: 25.4 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La frecuencia respiratoria debe encontrarse entre 10 y 120 rpm',
          );
          return true;
        },
      );
    });

    it('debe rechazar tiempo de llenado capilar < 1 s con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ capillaryRefillTime: 0 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'El tiempo de llenado capilar debe encontrarse entre 1 y 5 segundos',
          );
          return true;
        },
      );
    });

    it('debe rechazar tiempo de llenado capilar > 5 s con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ capillaryRefillTime: 6 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'El tiempo de llenado capilar debe encontrarse entre 1 y 5 segundos',
          );
          return true;
        },
      );
    });

    it('debe rechazar tiempo de llenado capilar con decimales con HTTP 422 Unprocessable Entity (RF-44)', () => {
      assert.throws(
        () => {
          vitalsValidator.validateVitals({ capillaryRefillTime: 2.5 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'El tiempo de llenado capilar debe encontrarse entre 1 y 5 segundos',
          );
          return true;
        },
      );
    });
  });

  describe('2. VisitsService.attendVisit: Registro médico y constantes (RF-43, RF-44)', () => {
    it('debe registrar exitosamente los datos clínicos y constantes de la visita (RF-43)', async () => {
      const attendDto: AttendVisitDto = {
        notes: 'Paciente alerta y en buen estado general.',
        diagnosis: 'Gastroenteritis bacteriana leve.',
        treatment: 'Amoxicilina 250mg cada 12h por 7 días, dieta blanda.',
        weight: 12.8,
        temperature: 38.6,
        heartRate: 105,
        respiratoryRate: 26,
        capillaryRefillTime: 2,
      };

      const result = await visitsService.attendVisit(
        validClinicId,
        validVisitId,
        validVetId,
        attendDto,
      );

      assert.strictEqual(result.id, validVisitId);
      assert.strictEqual(result.notes, attendDto.notes);
      assert.strictEqual(result.diagnosis, attendDto.diagnosis);
      assert.strictEqual(result.treatment, attendDto.treatment);
      assert.strictEqual(result.weight, 12.8);
      assert.strictEqual(result.temperature, 38.6);
      assert.strictEqual(result.heartRate, 105);
      assert.strictEqual(result.respiratoryRate, 26);
      assert.strictEqual(result.capillaryRefillTime, 2);
    });

    it('debe lanzar UnprocessableEntityException (HTTP 422) si alguna constante viola el rango biológico (RF-44)', async () => {
      const attendDto: AttendVisitDto = {
        notes: 'Signos vitales alterados',
        temperature: 44.5, // Fuera de rango (> 43.0)
      };

      await assert.rejects(
        async () => {
          await visitsService.attendVisit(validClinicId, validVisitId, validVetId, attendDto);
        },
        (err: any) => {
          assert.strictEqual(err instanceof UnprocessableEntityException, true);
          assert.strictEqual(
            err.message,
            'La temperatura corporal debe encontrarse entre 32.0 °C y 43.0 °C',
          );
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException (HTTP 404) si la visita no existe o es de otra clínica', async () => {
      const attendDto: AttendVisitDto = { notes: 'Consulta' };

      await assert.rejects(
        async () => {
          await visitsService.attendVisit(otherClinicId, validVisitId, validVetId, attendDto);
        },
        (err: any) => {
          assert.strictEqual(err instanceof NotFoundException, true);
          assert.strictEqual(err.message, 'Visita no encontrada');
          return true;
        },
      );
    });

    it('debe lanzar ConflictException (HTTP 409) si la visita está cancelada', async () => {
      mockVisits[0].status = VisitStatus.CANCELLED;
      const attendDto: AttendVisitDto = { notes: 'Intento de atención' };

      await assert.rejects(
        async () => {
          await visitsService.attendVisit(validClinicId, validVisitId, validVetId, attendDto);
        },
        (err: any) => {
          assert.strictEqual(err instanceof ConflictException, true);
          assert.strictEqual(err.message, 'No se puede atender una visita cancelada');
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException (HTTP 403) si la visita ya fue cerrada formalmente (RF-45)', async () => {
      mockVisits[0].closedAt = new Date();
      const attendDto: AttendVisitDto = { notes: 'Intento de modificación posterior al cierre' };

      await assert.rejects(
        async () => {
          await visitsService.attendVisit(validClinicId, validVisitId, validVetId, attendDto);
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

  describe('3. DTOs: Validación con class-validator (AttendVisitDto & RecordVitalsDto)', () => {
    it('AttendVisitDto debe ser válido con atributos opcionales correctos', async () => {
      const dto = plainToInstance(AttendVisitDto, {
        notes: 'Notas de atención',
        diagnosis: 'Otitis externa bilateral',
        treatment: 'Gotas óticas cada 8h por 10 días',
        weight: 15.2,
        temperature: 38.8,
        heartRate: 115,
        respiratoryRate: 28,
        capillaryRefillTime: 2,
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('AttendVisitDto debe ser válido con cuerpo vacío o campos opcionales ausentes', async () => {
      const dto = plainToInstance(AttendVisitDto, {});
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('AttendVisitDto debe fallar si weight o temperature no son numéricos', async () => {
      const dto = plainToInstance(AttendVisitDto, {
        weight: 'quince_kilos' as any,
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length > 0, true);
      assert.strictEqual(errors[0].property, 'weight');
    });

    it('RecordVitalsDto debe ser válido con constantes numéricas', async () => {
      const dto = plainToInstance(RecordVitalsDto, {
        weight: 8.5,
        temperature: 38.2,
        heartRate: 120,
        respiratoryRate: 30,
        capillaryRefillTime: 2,
      });

      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });
  });
});
