import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GrantScope, Role, VisitStatus } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { VisitNotesService } from '../../src/modules/visits/visit-notes.service';
import { CreateVisitNoteDto } from '../../src/modules/visits/dto/create-visit-note.dto';
import { VisitsService } from '../../src/modules/visits/visits.service';
import { VisitsController } from '../../src/modules/visits/visits.controller';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';
import { VitalsValidator } from '../../src/modules/visits/vitals.validator';

interface MockVet {
  id: string;
  name: string;
  email: string;
  role: Role;
  licenseNumber: string;
}

interface MockVisitNote {
  id: string;
  visitId: string;
  vetId: string;
  content: string;
  createdAt: Date;
  veterinarian?: MockVet;
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
  notesHistory?: MockVisitNote[];
  veterinarian?: MockVet;
}

describe('VisitNotesService, VisitsService & VisitsController - T21 (RF-46, RF-47, RNF-8)', () => {
  let visitNotesService: VisitNotesService;
  let visitsService: VisitsService;
  let visitsController: VisitsController;
  let collisionValidator: CollisionValidator;
  let vitalsValidator: VitalsValidator;

  const validClinicId = '11111111-1111-4111-8111-111111111111';
  const otherClinicId = '99999999-9999-4999-8999-999999999999';
  const validPetId = '22222222-2222-4222-8222-222222222222';
  const validVetId = '33333333-3333-4333-8333-333333333333';
  const closedVisitId = '44444444-4444-4444-8444-444444444444';
  const openVisitId = '55555555-5555-4555-8555-555555555555';

  let mockVisits: MockVisit[];
  let mockVisitNotes: MockVisitNote[];
  let mockVets: MockVet[];
  let mockPrisma: any;
  let mockAccessGrantsService: any;

  beforeEach(() => {
    vitalsValidator = new VitalsValidator();
    collisionValidator = new CollisionValidator();

    mockVets = [
      {
        id: validVetId,
        name: 'Dra. María Veterinario',
        email: 'maria.vet@clinica.com',
        role: Role.VET,
        licenseNumber: 'VET-12345',
      },
    ];

    mockVisitNotes = [
      {
        id: 'note-001',
        visitId: closedVisitId,
        vetId: validVetId,
        content: 'Nota evolutiva previa 24h post-consulta.',
        createdAt: new Date('2026-10-25T15:00:00.000Z'),
        veterinarian: mockVets[0],
      },
    ];

    mockVisits = [
      {
        id: closedVisitId,
        clinicId: validClinicId,
        vetId: validVetId,
        petId: validPetId,
        reason: 'Revisión general y desparasitación',
        notes: 'Anamnesis inicial conforme.',
        diagnosis: 'Paciente clínicamente estable.',
        treatment: 'Plan sanitario al día.',
        weight: 12.5,
        temperature: 38.6,
        heartRate: 110,
        respiratoryRate: 24,
        capillaryRefillTime: 2,
        scheduledDate: new Date('2026-10-25T10:00:00.000Z'),
        durationMinutes: 30,
        status: VisitStatus.SCHEDULED,
        cancellationReason: null,
        closedAt: new Date('2026-10-25T10:35:00.000Z'),
        deletedAt: null,
        createdAt: new Date('2026-10-25T09:00:00.000Z'),
        updatedAt: new Date('2026-10-25T10:35:00.000Z'),
      },
      {
        id: openVisitId,
        clinicId: validClinicId,
        vetId: validVetId,
        petId: validPetId,
        reason: 'Consulta activa sin cerrar',
        notes: null,
        diagnosis: null,
        treatment: null,
        weight: 12.5,
        temperature: 38.5,
        heartRate: 105,
        respiratoryRate: 22,
        capillaryRefillTime: 2,
        scheduledDate: new Date('2026-10-26T10:00:00.000Z'),
        durationMinutes: 30,
        status: VisitStatus.SCHEDULED,
        cancellationReason: null,
        closedAt: null,
        deletedAt: null,
        createdAt: new Date('2026-10-26T09:00:00.000Z'),
        updatedAt: new Date('2026-10-26T09:00:00.000Z'),
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
          return found ? { ...found } : null;
        },
        count: async ({ where }: any) => {
          return mockVisits.filter((v) => {
            if (where.petId && v.petId !== where.petId) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            return true;
          }).length;
        },
        findMany: async ({ where, skip = 0, take = 10, orderBy }: any) => {
          let list = mockVisits.filter((v) => {
            if (where.petId && v.petId !== where.petId) return false;
            if (where.deletedAt === null && v.deletedAt !== null) return false;
            return true;
          });

          if (orderBy?.scheduledDate === 'desc') {
            list = list.sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());
          }

          const paginated = list.slice(skip, skip + take);
          return paginated.map((v) => ({
            ...v,
            notesHistory: mockVisitNotes.filter((n) => n.visitId === v.id),
            veterinarian: mockVets.find((u) => u.id === v.vetId),
          }));
        },
      },
      visitNote: {
        create: async ({ data, include }: any) => {
          const newNote: MockVisitNote = {
            id: 'note-new-uuid',
            visitId: data.visitId,
            vetId: data.vetId,
            content: data.content,
            createdAt: data.createdAt || new Date(),
          };
          if (include?.veterinarian) {
            newNote.veterinarian = mockVets.find((u) => u.id === data.vetId);
          }
          mockVisitNotes.push(newNote);
          return newNote;
        },
        findMany: async ({ where, orderBy }: any) => {
          let notes = mockVisitNotes.filter((n) => n.visitId === where.visitId);
          if (orderBy?.createdAt === 'asc') {
            notes = notes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
          return notes;
        },
      },
    };

    mockAccessGrantsService = {
      hasActiveGrant: async (_petId: string, _clinicId: string, _scope?: GrantScope) => true,
    };

    visitsService = new VisitsService(
      mockPrisma,
      collisionValidator,
      vitalsValidator,
      mockAccessGrantsService,
    );
    visitNotesService = new VisitNotesService(mockPrisma);
    visitsController = new VisitsController(visitsService, visitNotesService);
  });

  describe('1. Creación exitosa de nota complementaria inmutable (RF-46)', () => {
    it('debe registrar exitosamente una nota evolutiva vinculada a una visita cerrada con autoría y timestamp', async () => {
      const createDto: CreateVisitNoteDto = {
        content: 'Paciente evoluciona favorablemente a las 48 horas sin recidivas de fiebre.',
      };

      const note = await visitNotesService.createNote(
        validClinicId,
        closedVisitId,
        validVetId,
        createDto,
      );

      assert.strictEqual(note.visitId, closedVisitId);
      assert.strictEqual(note.vetId, validVetId);
      assert.strictEqual(note.content, createDto.content);
      assert.ok(note.createdAt instanceof Date);
      assert.strictEqual((note as any).veterinarian?.name, 'Dra. María Veterinario');
      assert.strictEqual((note as any).veterinarian?.licenseNumber, 'VET-12345');
    });

    it('debe recortar espacios en blanco (trim) en el contenido de la nota al persistir', async () => {
      const createDto: CreateVisitNoteDto = {
        content: '   Nota complementaria con espacios sobrantes en extremos.   ',
      };

      const note = await visitNotesService.createNote(
        validClinicId,
        closedVisitId,
        validVetId,
        createDto,
      );

      assert.strictEqual(
        note.content,
        'Nota complementaria con espacios sobrantes en extremos.',
      );
    });

    it('debe lanzar NotFoundException (HTTP 404) si la visita no existe o es de otra clínica', async () => {
      const createDto: CreateVisitNoteDto = {
        content: 'Nota complementaria válida de prueba.',
      };

      await assert.rejects(
        async () => {
          await visitNotesService.createNote(
            otherClinicId,
            closedVisitId,
            validVetId,
            createDto,
          );
        },
        (error: any) => {
          assert.ok(error instanceof NotFoundException);
          assert.match(error.message, /no encontrada/i);
          return true;
        },
      );
    });
  });

  describe('2. Rechazo con HTTP 409 Conflict si la visita no ha sido cerrada (RF-46)', () => {
    it('debe lanzar ConflictException (HTTP 409) con mensaje estricto si la visita tiene closedAt === null', async () => {
      const createDto: CreateVisitNoteDto = {
        content: 'Intento de nota sobre visita médica abierta todavía.',
      };

      await assert.rejects(
        async () => {
          await visitNotesService.createNote(
            validClinicId,
            openVisitId,
            validVetId,
            createDto,
          );
        },
        (error: any) => {
          assert.ok(error instanceof ConflictException);
          assert.strictEqual(
            error.message,
            'Solo se pueden registrar notas evolutivas complementarias sobre visitas médicas cerradas',
          );
          return true;
        },
      );
    });
  });

  describe('3. Verificación de inmutabilidad estricta (VisitNote append-only)', () => {
    it('la clase VisitNotesService NO debe poseer métodos de modificación o eliminación (update, delete, remove, softDelete)', () => {
      const prototype = Object.getPrototypeOf(visitNotesService);
      assert.strictEqual(typeof prototype.update, 'undefined');
      assert.strictEqual(typeof prototype.delete, 'undefined');
      assert.strictEqual(typeof prototype.remove, 'undefined');
      assert.strictEqual(typeof prototype.softDelete, 'undefined');
      assert.strictEqual(typeof prototype.patch, 'undefined');
    });

    it('debe permitir consultar las notas evolutivas de una visita ordenadas cronológicamente ascendente', async () => {
      const notes = await visitNotesService.findByVisitId(closedVisitId);
      assert.ok(Array.isArray(notes));
      assert.ok(notes.length >= 1);
      assert.strictEqual(notes[0].content, 'Nota evolutiva previa 24h post-consulta.');
    });
  });

  describe('4. Consulta de historial clínico de la mascota con paginación bajo AccessGrant (RF-47)', () => {
    it('debe retornar visitas ordenadas cronológicamente de forma descendente con notas y paginación si el grant está activo', async () => {
      const result = await visitsService.getPetMedicalHistory(
        validPetId,
        validClinicId,
        1,
        10,
      );

      assert.ok(result.data);
      assert.strictEqual(result.data.length, 2);
      assert.strictEqual(result.meta.total, 2);
      assert.strictEqual(result.meta.page, 1);
      assert.strictEqual(result.meta.limit, 10);
      assert.strictEqual(result.meta.totalPages, 1);
      assert.strictEqual(result.meta.hasNextPage, false);
      assert.strictEqual(result.meta.hasPrevPage, false);

      // Orden cronológico descendente (scheduledDate desc)
      assert.ok(
        new Date(result.data[0].scheduledDate).getTime() >=
          new Date(result.data[1].scheduledDate).getTime(),
      );

      // Verificación de notesHistory incluidas
      const closed = result.data.find((v) => v.id === closedVisitId) as any;
      assert.ok(closed);
      assert.ok(Array.isArray(closed.notesHistory));
      assert.strictEqual(closed.notesHistory.length, 1);
      assert.strictEqual(closed.notesHistory[0].content, 'Nota evolutiva previa 24h post-consulta.');
    });
  });

  describe('5. Rechazo con HTTP 403 Forbidden si el AccessGrant venció o no existe (RF-47, RNF-8)', () => {
    it('debe lanzar ForbiddenException (HTTP 403) con mensaje descriptivo si AccessGrantsService.hasActiveGrant retorna false', async () => {
      mockAccessGrantsService.hasActiveGrant = async () => false;

      await assert.rejects(
        async () => {
          await visitsService.getPetMedicalHistory(
            validPetId,
            validClinicId,
            1,
            10,
          );
        },
        (error: any) => {
          assert.ok(error instanceof ForbiddenException);
          assert.strictEqual(
            error.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
          );
          return true;
        },
      );
    });
  });

  describe('6. Integración de VisitsController con roles RBAC y endpoints de notas e historial', () => {
    it('POST /visits/:id/notes debe tener @Roles(Role.VET) y delegar a visitNotesService.createNote', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, VisitsController.prototype.createNote);
      assert.deepStrictEqual(roles, [Role.VET]);

      const req: any = { user: { userId: validVetId } };
      const dto: CreateVisitNoteDto = {
        content: 'Evolución clínica satisfactoria registrada por veterinario.',
      };

      const result = await visitsController.createNote(
        validClinicId,
        closedVisitId,
        req,
        dto,
      );

      assert.strictEqual(result.visitId, closedVisitId);
      assert.strictEqual(result.content, dto.content);
    });

    it('GET /visits/:id/notes debe listar las notas evolutivas de la visita', async () => {
      const notes = await visitsController.findNotesByVisitId(closedVisitId);
      assert.ok(Array.isArray(notes));
      assert.ok(notes.length >= 1);
    });

    it('GET /visits/history/pet/:petId debe tener @Roles(Role.VET, Role.ADMIN) y delegar a visitsService.getPetMedicalHistory', async () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        VisitsController.prototype.getPetMedicalHistory,
      );
      assert.deepStrictEqual(roles, [Role.VET, Role.ADMIN]);

      mockAccessGrantsService.hasActiveGrant = async () => true;
      const history = await visitsController.getPetMedicalHistory(
        validClinicId,
        validPetId,
        1,
        10,
      );

      assert.ok(history.data);
      assert.strictEqual(history.meta.total, 2);
    });
  });

  describe('7. Validación sintáctica de CreateVisitNoteDto con class-validator (RF-46)', () => {
    it('debe ser válido cuando content tiene entre 5 y 2000 caracteres', async () => {
      const dto = plainToInstance(CreateVisitNoteDto, {
        content: 'Nota médica evolutiva complementaria válida.',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('debe fallar si content está vacío o ausente', async () => {
      const dto = plainToInstance(CreateVisitNoteDto, {});
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.strictEqual(errors[0].property, 'content');
    });

    it('debe fallar si content tiene menos de 5 caracteres', async () => {
      const dto = plainToInstance(CreateVisitNoteDto, {
        content: 'abc',
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.strictEqual(errors[0].property, 'content');
    });

    it('debe fallar si content excede 2000 caracteres', async () => {
      const dto = plainToInstance(CreateVisitNoteDto, {
        content: 'a'.repeat(2001),
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0);
      assert.strictEqual(errors[0].property, 'content');
    });
  });
});
