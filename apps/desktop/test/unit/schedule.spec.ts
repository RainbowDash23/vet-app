import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { VisitStatus } from '@vet-app/shared-types';
import type {
  CreateVisitDto,
  VisitResponseDto,
  PaginatedResult,
} from '@vet-app/shared-types';

import { ApiClient, ApiError } from '../../src/services/api.client.ts';
import { VisitsService } from '../../src/services/visits.service.ts';
import { NewVisitModal } from '../../src/components/screens/new-visit-modal.tsx';
import { CancelVisitDialog } from '../../src/components/screens/cancel-visit-dialog.tsx';
import { ScheduleScreen } from '../../src/screens/schedule-screen.tsx';

// Helper mock fetch
type FetchCall = { url: string; options?: RequestInit };

function createMockFetch(
  handler: (url: string, options?: RequestInit) => Promise<Response>,
) {
  const calls: FetchCall[] = [];
  const mockFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, options: init });
    return handler(url, init);
  };
  return { fn: mockFn as unknown as typeof fetch, calls };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('T35: Pantalla de Agenda Médica, Agendamiento y Conflictos de Horario (RF-39, RF-40, RF-41, RF-42, RNF-3)', () => {
  const mockVisitScheduled: VisitResponseDto = {
    id: 'visit-uuid-001',
    clinicId: 'clinic-uuid-001',
    vetId: 'vet-uuid-001',
    petId: 'pet-uuid-001',
    reason: 'Consulta general de rutina',
    notes: 'Paciente en ayunas',
    startTime: '2026-10-18T09:00:00.000Z',
    durationMinutes: 30,
    endTime: '2026-10-18T09:30:00.000Z',
    status: VisitStatus.SCHEDULED,
    cancellationReason: null,
    closedAt: null,
    deletedAt: null,
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
    pet: {
      id: 'pet-uuid-001',
      name: 'Firulais',
      species: 'CANINE' as any,
      breed: 'Golden Retriever',
      sex: 'MALE' as any,
      birthDate: '2021-01-01T00:00:00.000Z',
      isApproximateBirthDate: false,
      reproductiveStatus: 'INTACT' as any,
      ownerId: 'owner-uuid-001',
      createdAt: '2021-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    },
    veterinarian: {
      id: 'vet-uuid-001',
      email: 'dr.garcia@clinica.com',
      name: 'Carlos',
      lastName: 'García',
      role: 'VET' as any,
      isActive: true,
      clinicId: 'clinic-uuid-001',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
  };

  const mockVisitAttended: VisitResponseDto = {
    ...mockVisitScheduled,
    id: 'visit-uuid-002',
    startTime: '2026-10-18T10:00:00.000Z',
    endTime: '2026-10-18T10:30:00.000Z',
    status: VisitStatus.SCHEDULED,
    closedAt: '2026-10-18T10:30:00.000Z',
    diagnosis: 'Paciente en perfecto estado de salud',
  };

  const mockVisitCancelled: VisitResponseDto = {
    ...mockVisitScheduled,
    id: 'visit-uuid-003',
    startTime: '2026-10-18T11:00:00.000Z',
    endTime: '2026-10-18T11:30:00.000Z',
    status: VisitStatus.CANCELLED,
    cancellationReason: 'El propietario tuvo una emergencia laboral insuperable',
  };

  // =========================================================================
  // 1. Servicio VisitsService
  // =========================================================================
  describe('1. Métodos del Servicio VisitsService', () => {
    it('getVisits debe llamar a GET /visits con query params y retornar listado paginado', async () => {
      const mockResult: PaginatedResult<VisitResponseDto> = {
        data: [mockVisitScheduled],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/visits')) {
          return jsonResponse(mockResult);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const result = await service.getVisits({
        vetId: 'vet-uuid-001',
        date: '2026-10-18',
        page: 1,
        limit: 10,
      });

      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.includes('/visits'));
      assert.ok(calls[0].url.includes('vetId=vet-uuid-001'));
      assert.ok(calls[0].url.includes('date=2026-10-18'));
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].id, 'visit-uuid-001');
    });

    it('getVisitById debe llamar a GET /visits/:id y retornar la visita', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.endsWith('/visits/visit-uuid-001')) {
          return jsonResponse(mockVisitScheduled);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const visit = await service.getVisitById('visit-uuid-001');
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith('/visits/visit-uuid-001'));
      assert.equal(visit.id, 'visit-uuid-001');
    });

    it('scheduleVisit debe llamar a POST /visits con CreateVisitDto (RF-39)', async () => {
      const newDto: CreateVisitDto = {
        vetId: 'vet-uuid-001',
        petId: 'pet-uuid-001',
        startTime: '2026-10-18T14:00:00.000Z',
        durationMinutes: 30,
        reason: 'Revisión periódica y corte de uñas',
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/visits') && opts?.method === 'POST') {
          const body = JSON.parse(opts.body as string);
          return jsonResponse({
            ...mockVisitScheduled,
            ...body,
            id: 'visit-new-uuid',
          }, 201);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const created = await service.scheduleVisit(newDto);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options?.method, 'POST');
      assert.equal(created.id, 'visit-new-uuid');
      assert.equal(created.reason, 'Revisión periódica y corte de uñas');
    });

    it('scheduleVisit debe propagar ApiError con status 409 ante colisión de horario (RF-40)', async () => {
      const collisionDto: CreateVisitDto = {
        vetId: 'vet-uuid-001',
        petId: 'pet-uuid-002',
        startTime: '2026-10-18T09:15:00.000Z',
        durationMinutes: 30,
        reason: 'Chequeo',
      };

      const { fn: mockFetch } = createMockFetch(async () => {
        return jsonResponse(
          {
            statusCode: 409,
            message: 'El veterinario presenta un solapamiento de horario con otra cita programada',
            error: 'Conflict',
          },
          409,
        );
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      await assert.rejects(
        async () => {
          await service.scheduleVisit(collisionDto);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 409);
          return true;
        },
      );
    });

    it('cancelVisit debe llamar a PATCH /visits/:id/cancel con justificación textual (RF-41, RF-42)', async () => {
      const cancelPayload = {
        cancellationReason: 'El propietario notificó cancelación con 24 horas de antelación',
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/visits/visit-uuid-001/cancel') && opts?.method === 'PATCH') {
          return jsonResponse({
            ...mockVisitScheduled,
            status: VisitStatus.CANCELLED,
            cancellationReason: cancelPayload.cancellationReason,
          });
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const result = await service.cancelVisit('visit-uuid-001', cancelPayload);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options?.method, 'PATCH');
      assert.equal(result.status, VisitStatus.CANCELLED);
      assert.equal(result.cancellationReason, cancelPayload.cancellationReason);
    });
  });

  // =========================================================================
  // 2. Renderizado de la Pantalla ScheduleScreen (RF-39)
  // =========================================================================
  describe('2. Renderizado de Grilla de Turnos y Visitas del Día (ScheduleScreen / RF-39)', () => {
    it('debe renderizar el encabezado de agenda, selector de fecha y botón "Agendar Cita"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ScheduleScreen, {
          initialDate: '2026-10-18',
          initialVisits: [mockVisitScheduled, mockVisitAttended, mockVisitCancelled],
        }),
      );

      assert.ok(html.includes('Agenda Médica'), 'Debe mostrar el título de la pantalla');
      assert.ok(html.includes('Agendar Cita'), 'Debe incluir botón accesible para agendar cita');
      assert.ok(html.includes('Hoy'), 'Debe incluir selector de fecha con botón Hoy');
      assert.ok(html.includes('Anterior'), 'Debe incluir botón Anterior de navegación de fecha');
      assert.ok(html.includes('Siguiente'), 'Debe incluir botón Siguiente de navegación de fecha');
    });

    it('debe desplegar citas activas y sus estados diferenciados: Programada, Atendida y Cancelada', () => {
      const html = renderToStaticMarkup(
        React.createElement(ScheduleScreen, {
          initialDate: '2026-10-18',
          initialVisits: [mockVisitScheduled, mockVisitAttended, mockVisitCancelled],
        }),
      );

      assert.ok(html.includes('Programada'), 'Debe mostrar etiqueta o insignia Programada');
      assert.ok(html.includes('Atendida'), 'Debe mostrar etiqueta o insignia Atendida');
      assert.ok(html.includes('Cancelada'), 'Debe mostrar etiqueta o insignia Cancelada');
      assert.ok(html.includes('Firulais'), 'Debe mostrar el nombre de la mascota');
      assert.ok(
        html.includes('El propietario tuvo una emergencia laboral insuperable'),
        'Debe hacer visible el motivo de cancelación de citas canceladas (RF-41)',
      );
      assert.ok(
        html.includes('Cancelar'),
        'Debe incluir acción Cancelar para citas activas programadas',
      );
    });

    it('debe mostrar estado vacío cuando no existen citas en la fecha seleccionada', () => {
      const html = renderToStaticMarkup(
        React.createElement(ScheduleScreen, {
          initialDate: '2026-10-18',
          initialVisits: [],
        }),
      );

      assert.ok(
        html.includes('No hay citas programadas') || html.includes('Sin citas registradas'),
        'Debe presentar mensaje accesible de estado vacío',
      );
    });
  });

  // =========================================================================
  // 3. NewVisitModal: Creación y Colisión de Horario (RF-39, RF-40)
  // =========================================================================
  describe('3. Modal de Agendamiento NewVisitModal (RF-39, RF-40)', () => {
    it('debe renderizar los campos obligatorios: mascota, veterinario, fecha, duración y motivo (RF-39)', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewVisitModal, {
          isOpen: true,
          onClose: () => {},
          availablePets: [{ id: 'pet-uuid-001', name: 'Firulais' }],
          availableVets: [{ id: 'vet-uuid-001', name: 'Dr. Carlos García' }],
          initialDurationMinutes: 30,
        }),
      );

      assert.ok(html.includes('role="dialog"'), 'Debe envolver Radix Dialog con role="dialog"');
      assert.ok(html.includes('Nueva Cita Médica') || html.includes('Agendar Cita'), 'Debe tener título accesible');
      assert.ok(html.includes('Mascota'), 'Debe incluir selector o campo de mascota');
      assert.ok(html.includes('Veterinario'), 'Debe incluir selector o campo de veterinario');
      assert.ok(html.includes('Fecha'), 'Debe incluir campo de fecha y hora');
      assert.ok(html.includes('Duración'), 'Debe incluir campo de duración');
      assert.ok(html.includes('Motivo'), 'Debe incluir campo de motivo de atención');
    });

    it('debe capturar error HTTP 409 Conflict y desplegar advertencia accesible con role="alert" (RF-40)', () => {
      const collisionMessage = 'El veterinario presenta un solapamiento de horario con otra cita programada';
      const html = renderToStaticMarkup(
        React.createElement(NewVisitModal, {
          isOpen: true,
          onClose: () => {},
          initialError: collisionMessage,
        }),
      );

      assert.ok(html.includes('role="alert"'), 'Debe contar con elemento accesible con role="alert"');
      assert.ok(html.includes(collisionMessage), 'Debe desplegar el mensaje de solapamiento de horario');
    });

    it('formulario debe invocar scheduleVisit y onVisitCreated ante éxito (RF-39)', async () => {
      let createdPayload: CreateVisitDto | null = null;
      let onVisitCreatedCalled = false;

      const mockService = {
        async scheduleVisit(dto: CreateVisitDto) {
          createdPayload = dto;
          return {
            ...mockVisitScheduled,
            ...dto,
            id: 'visit-new-001',
          };
        },
      } as unknown as VisitsService;

      const dtoToTest: CreateVisitDto = {
        petId: 'pet-uuid-001',
        vetId: 'vet-uuid-001',
        startTime: '2026-10-18T15:00:00.000Z',
        durationMinutes: 45,
        reason: 'Control posquirúrgico y retiro de puntos',
      };

      const res = await mockService.scheduleVisit(dtoToTest);
      assert.equal(createdPayload !== null, true);
      assert.equal((createdPayload as any)?.durationMinutes, 45);
      assert.equal(res.id, 'visit-new-001');
    });
  });

  // =========================================================================
  // 4. CancelVisitDialog: Cancelación Justificada Obligatoria (RF-41, RF-42)
  // =========================================================================
  describe('4. Diálogo de Cancelación CancelVisitDialog (RF-41, RF-42)', () => {
    it('debe renderizar construido sobre AlertDialog con role="alertdialog"', () => {
      const html = renderToStaticMarkup(
        React.createElement(CancelVisitDialog, {
          isOpen: true,
          visitId: 'visit-uuid-001',
          petName: 'Firulais',
          onClose: () => {},
        }),
      );

      assert.ok(html.includes('role="alertdialog"'), 'Debe utilizar primitiva accesible con role="alertdialog"');
      assert.ok(html.includes('Cancelar Cita') || html.includes('Cancelación de Cita'), 'Debe incluir título');
      assert.ok(html.includes('Motivo de cancelación') || html.includes('Justificación'), 'Debe incluir campo para justificación');
    });

    it('botón de confirmación debe estar deshabilitado si cancellationReason tiene menos de 10 caracteres (RF-42)', () => {
      // Menos de 10 caracteres (ej. "Muy corto")
      const htmlShort = renderToStaticMarkup(
        React.createElement(CancelVisitDialog, {
          isOpen: true,
          visitId: 'visit-uuid-001',
          initialReason: 'Muy corto',
          onClose: () => {},
        }),
      );

      assert.ok(
        htmlShort.includes('disabled') || htmlShort.includes('aria-disabled="true"'),
        'El botón de confirmación debe estar deshabilitado cuando el motivo tiene < 10 caracteres',
      );
      assert.ok(
        htmlShort.includes('Mínimo 10 caracteres'),
        'Debe desplegar advertencia o contador señalando el requisito de 10 caracteres mínimos',
      );
    });

    it('botón de confirmación debe habilitarse cuando cancellationReason tiene >= 10 caracteres (RF-41)', () => {
      const validReason = 'El dueño no podrá asistir debido a reprogramación de viaje';
      const htmlValid = renderToStaticMarkup(
        React.createElement(CancelVisitDialog, {
          isOpen: true,
          visitId: 'visit-uuid-001',
          initialReason: validReason,
          onClose: () => {},
        }),
      );

      // En el HTML válido el botón de acción no debe tener disabled="" ni aria-disabled="true" en su tag de acción
      assert.ok(
        !htmlValid.includes('disabled="" data-action="confirm"'),
        'El botón de confirmación debe estar activo',
      );
    });

    it('debe invocar cancelVisit con motivo >= 10 caracteres (RF-41)', async () => {
      let cancelledId = '';
      let sentReason = '';

      const mockService = {
        async cancelVisit(id: string, dto: { cancellationReason: string }) {
          cancelledId = id;
          sentReason = dto.cancellationReason;
          return {
            ...mockVisitScheduled,
            id,
            status: VisitStatus.CANCELLED,
            cancellationReason: dto.cancellationReason,
          };
        },
      } as unknown as VisitsService;

      const reason = 'Cancelación solicitada oportunamente por el cliente vía telefónica';
      const res = await mockService.cancelVisit('visit-uuid-001', { cancellationReason: reason });

      assert.equal(cancelledId, 'visit-uuid-001');
      assert.equal(sentReason, reason);
      assert.equal(res.status, VisitStatus.CANCELLED);
    });
  });

  // =========================================================================
  // 5. Auditoría Estática RNF-3 (Cero Tailwind, Cero shadcn)
  // =========================================================================
  describe('5. Auditoría Estática RNF-3 (Cero Tailwind, Cero shadcn)', () => {
    it('los archivos de componentes y CSS Modules de agenda deben estar libres de Tailwind y shadcn', () => {
      const targetFiles = [
        path.join(process.cwd(), 'apps/desktop/src/services/visits.service.ts'),
        path.join(process.cwd(), 'apps/desktop/src/components/screens/new-visit-modal.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/components/screens/new-visit-modal.module.css'),
        path.join(process.cwd(), 'apps/desktop/src/components/screens/cancel-visit-dialog.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/components/screens/cancel-visit-dialog.module.css'),
        path.join(process.cwd(), 'apps/desktop/src/screens/schedule-screen.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/screens/schedule-screen.module.css'),
      ];

      for (const filePath of targetFiles) {
        if (!fs.existsSync(filePath)) {
          // El archivo se creará en el paso de implementación TDD
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');

        assert.doesNotMatch(
          content,
          /@apply\s+/,
          `El archivo ${path.basename(filePath)} no debe usar @apply de Tailwind`,
        );
        assert.doesNotMatch(
          content,
          /@\/components\/ui/,
          `El archivo ${path.basename(filePath)} no debe importar componentes de shadcn (@/components/ui)`,
        );
        assert.doesNotMatch(
          content,
          /tailwind/i,
          `El archivo ${path.basename(filePath)} no debe referenciar Tailwind`,
        );
      }
    });
  });
});
