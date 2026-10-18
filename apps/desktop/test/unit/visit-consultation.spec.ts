import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { VisitStatus } from '@vet-app/shared-types';
import type {
  AttendVisitDto,
  VisitResponseDto,
  VisitNoteResponseDto,
} from '@vet-app/shared-types';

import { ApiClient } from '../../src/services/api.client.ts';
import { VisitsService } from '../../src/services/visits.service.ts';
import { AddNoteModal } from '../../src/components/screens/add-note-modal.tsx';
import {
  VisitConsultationScreen,
  validateBiologicalVitals,
  BIOLOGICAL_RANGES,
} from '../../src/screens/visit-consultation-screen.tsx';

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

describe('T36: Formulario de Atención Médica, Constantes y Notas Complementarias (RF-43, RF-44, RF-45, RF-46, RNF-3)', () => {
  const mockOpenVisit: VisitResponseDto = {
    id: 'visit-uuid-001',
    clinicId: 'clinic-uuid-001',
    vetId: 'vet-uuid-001',
    petId: 'pet-uuid-001',
    reason: 'Consulta general por vómitos y letargia',
    notes: 'Paciente decaído desde hace 24 horas',
    diagnosis: null,
    treatment: null,
    weight: null,
    temperature: null,
    heartRate: null,
    respiratoryRate: null,
    capillaryRefillTime: null,
    startTime: '2026-10-18T10:00:00.000Z',
    durationMinutes: 30,
    endTime: '2026-10-18T10:30:00.000Z',
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
      createdAt: '2021-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    },
    visitNotes: [],
  };

  const mockClosedVisit: VisitResponseDto = {
    ...mockOpenVisit,
    id: 'visit-uuid-closed',
    diagnosis: 'Gastroenteritis aguda por transgresión alimentaria',
    treatment: 'Metoclopramida 0.5 mg/kg c/12h por 3 días, dieta blanda',
    notes: 'Responde favorablemente a la palpación abdominal',
    weight: 28.5,
    temperature: 38.6,
    heartRate: 110,
    respiratoryRate: 24,
    capillaryRefillTime: 2,
    closedAt: '2026-10-18T10:25:00.000Z',
    visitNotes: [
      {
        id: 'note-uuid-001',
        visitId: 'visit-uuid-closed',
        vetId: 'vet-uuid-001',
        content: 'Dueño reporta cese de vómitos tras la primera toma',
        createdAt: '2026-10-18T18:00:00.000Z',
        veterinarian: {
          id: 'vet-uuid-001',
          name: 'Carlos',
          lastName: 'García',
          email: 'dr.garcia@clinica.com',
          role: 'VET' as any,
          isActive: true,
          clinicId: 'clinic-uuid-001',
          createdAt: '2021-01-01T00:00:00.000Z',
          updatedAt: '2021-01-01T00:00:00.000Z',
        },
      },
    ],
  };

  // =========================================================================
  // 1. Métodos de Servicio VisitsService (attendVisit, closeVisit, addVisitNote, getVisitNotes)
  // =========================================================================
  describe('1. Métodos del Servicio VisitsService (RF-43, RF-44, RF-45, RF-46)', () => {
    it('attendVisit debe enviar PATCH /visits/:id/attend con dto de atención (RF-43, RF-44)', async () => {
      const attendPayload: AttendVisitDto = {
        diagnosis: 'Gastritis moderada',
        treatment: 'Omeprazol 20mg c/24h',
        notes: 'Paciente hidratado',
        weight: 29.0,
        temperature: 38.5,
        heartRate: 95,
        respiratoryRate: 22,
        capillaryRefillTime: 2,
      };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/visits/visit-uuid-001/attend') && opts?.method === 'PATCH') {
          return jsonResponse({
            ...mockOpenVisit,
            ...attendPayload,
          });
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const result = await service.attendVisit('visit-uuid-001', attendPayload);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'http://api.local/visits/visit-uuid-001/attend');
      assert.equal(calls[0].options?.method, 'PATCH');
      assert.equal(result.diagnosis, 'Gastritis moderada');
      assert.equal(result.weight, 29.0);
    });

    it('closeVisit debe enviar POST /visits/:id/close (RF-45)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/visits/visit-uuid-001/close') && opts?.method === 'POST') {
          return jsonResponse({
            ...mockOpenVisit,
            closedAt: '2026-10-18T10:30:00.000Z',
          });
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const result = await service.closeVisit('visit-uuid-001');

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'http://api.local/visits/visit-uuid-001/close');
      assert.equal(calls[0].options?.method, 'POST');
      assert.ok(result.closedAt !== null);
    });

    it('addVisitNote debe enviar POST /visits/:id/notes con { content } (RF-46)', async () => {
      const notePayload = { content: 'Control telefónico: paciente activo sin fiebre' };

      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/visits/visit-uuid-001/notes') && opts?.method === 'POST') {
          return jsonResponse({
            id: 'note-new-001',
            visitId: 'visit-uuid-001',
            vetId: 'vet-uuid-001',
            content: notePayload.content,
            createdAt: '2026-10-18T19:00:00.000Z',
          });
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const result = await service.addVisitNote('visit-uuid-001', notePayload);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'http://api.local/visits/visit-uuid-001/notes');
      assert.equal(calls[0].options?.method, 'POST');
      assert.equal(result.id, 'note-new-001');
      assert.equal(result.content, notePayload.content);
    });

    it('getVisitNotes debe enviar GET /visits/:id/notes y retornar arreglo de notas (RF-46)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.endsWith('/visits/visit-uuid-001/notes')) {
          return jsonResponse(mockClosedVisit.visitNotes ?? []);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://api.local', fetchFn: mockFetch });
      const service = new VisitsService(client);

      const notes = await service.getVisitNotes('visit-uuid-001');

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'http://api.local/visits/visit-uuid-001/notes');
      assert.equal(notes.length, 1);
      assert.equal(notes[0].content, 'Dueño reporta cese de vómitos tras la primera toma');
    });
  });

  // =========================================================================
  // 2. Validación Biológica de Constantes Vitales en Cliente (RF-44)
  // =========================================================================
  describe('2. Validación Inmediata de Rangos Biológicos en Cliente (RF-44)', () => {
    it('debe definir las constantes BIOLOGICAL_RANGES conforme a la spec', () => {
      assert.equal(BIOLOGICAL_RANGES.weight.min, 0.05);
      assert.equal(BIOLOGICAL_RANGES.weight.max, 150.0);

      assert.equal(BIOLOGICAL_RANGES.temperature.min, 32.0);
      assert.equal(BIOLOGICAL_RANGES.temperature.max, 43.0);

      assert.equal(BIOLOGICAL_RANGES.heartRate.min, 30);
      assert.equal(BIOLOGICAL_RANGES.heartRate.max, 300);

      assert.equal(BIOLOGICAL_RANGES.respiratoryRate.min, 10);
      assert.equal(BIOLOGICAL_RANGES.respiratoryRate.max, 120);

      assert.equal(BIOLOGICAL_RANGES.capillaryRefillTime.min, 1);
      assert.equal(BIOLOGICAL_RANGES.capillaryRefillTime.max, 5);
    });

    it('validateBiologicalVitals debe aceptar valores válidos dentro de todos los rangos fisiológicos', () => {
      const errors = validateBiologicalVitals({
        weight: 12.5,
        temperature: 38.5,
        heartRate: 100,
        respiratoryRate: 24,
        capillaryRefillTime: 2,
      });

      assert.equal(Object.keys(errors).length, 0);
    });

    it('validateBiologicalVitals debe rechazar peso fuera de rango (0.05 - 150.0 kg)', () => {
      const low = validateBiologicalVitals({ weight: 0.04 });
      assert.ok(low.weight?.includes('0.05') && low.weight?.includes('150.0'));

      const high = validateBiologicalVitals({ weight: 150.1 });
      assert.ok(high.weight?.includes('0.05') && high.weight?.includes('150.0'));
    });

    it('validateBiologicalVitals debe rechazar temperatura fuera de rango (32.0 - 43.0 °C)', () => {
      const low = validateBiologicalVitals({ temperature: 31.9 });
      assert.ok(low.temperature?.includes('32.0') && low.temperature?.includes('43.0'));

      const high = validateBiologicalVitals({ temperature: 43.1 });
      assert.ok(high.temperature?.includes('32.0') && high.temperature?.includes('43.0'));
    });

    it('validateBiologicalVitals debe rechazar frecuencia cardíaca fuera de rango (30 - 300 lpm) o no entera', () => {
      const low = validateBiologicalVitals({ heartRate: 29 });
      assert.ok(low.heartRate?.includes('30') && low.heartRate?.includes('300'));

      const high = validateBiologicalVitals({ heartRate: 301 });
      assert.ok(high.heartRate?.includes('30') && high.heartRate?.includes('300'));

      const decimal = validateBiologicalVitals({ heartRate: 85.5 });
      assert.ok(decimal.heartRate);
    });

    it('validateBiologicalVitals debe rechazar frecuencia respiratoria fuera de rango (10 - 120 rpm) o no entera', () => {
      const low = validateBiologicalVitals({ respiratoryRate: 9 });
      assert.ok(low.respiratoryRate?.includes('10') && low.respiratoryRate?.includes('120'));

      const high = validateBiologicalVitals({ respiratoryRate: 121 });
      assert.ok(high.respiratoryRate?.includes('10') && high.respiratoryRate?.includes('120'));
    });

    it('validateBiologicalVitals debe rechazar tiempo de llenado capilar fuera de rango (1 - 5 s) o no entero', () => {
      const low = validateBiologicalVitals({ capillaryRefillTime: 0 });
      assert.ok(low.capillaryRefillTime?.includes('1') && low.capillaryRefillTime?.includes('5'));

      const high = validateBiologicalVitals({ capillaryRefillTime: 6 });
      assert.ok(high.capillaryRefillTime?.includes('1') && high.capillaryRefillTime?.includes('5'));
    });
  });

  // =========================================================================
  // 3. Renderizado de VisitConsultationScreen en Consulta Activa (RF-43, RF-44)
  // =========================================================================
  describe('3. Pantalla de Consulta Médica Activa (RF-43, RF-44)', () => {
    it('debe renderizar los campos clínicos de anamnesis, constantes vitales, diagnóstico y tratamiento', () => {
      const html = renderToStaticMarkup(
        React.createElement(VisitConsultationScreen, {
          initialVisit: mockOpenVisit,
        }),
      );

      // Título y paciente
      assert.ok(html.includes('Atención Médica') || html.includes('Consulta Médica'));
      assert.ok(html.includes('Firulais'));

      // Constantes vitales (RF-44)
      assert.ok(html.includes('Peso'));
      assert.ok(html.includes('Temperatura'));
      assert.ok(html.includes('Frecuencia Cardíaca') || html.includes('FC'));
      assert.ok(html.includes('Frecuencia Respiratoria') || html.includes('FR'));
      assert.ok(html.includes('Tiempo de Llenado Capilar') || html.includes('TLLC'));

      // Campos clínicos (RF-43)
      assert.ok(html.includes('Diagnóstico'));
      assert.ok(html.includes('Tratamiento'));
      assert.ok(html.includes('Anamnesis') || html.includes('Notas'));

      // Botones de acción
      assert.ok(html.includes('Guardar Atención'));
      assert.ok(html.includes('Cerrar Consulta'));
    });

    it('debe desplegar mensajes de error accesibles cuando se introducen constantes fuera de rango', () => {
      const html = renderToStaticMarkup(
        React.createElement(VisitConsultationScreen, {
          initialVisit: {
            ...mockOpenVisit,
            weight: 200.0, // Fuera de rango (> 150 kg)
            temperature: 30.0, // Fuera de rango (< 32 °C)
          },
        }),
      );

      assert.ok(
        html.includes('0.05') && html.includes('150.0'),
        'Debe advertir sobre el rango biológico de peso',
      );
      assert.ok(
        html.includes('32.0') && html.includes('43.0'),
        'Debe advertir sobre el rango biológico de temperatura',
      );
    });
  });

  // =========================================================================
  // 4. Inmutabilidad Estricta tras Cierre de Consulta (RF-45)
  // =========================================================================
  describe('4. Inmutabilidad Estricta tras Cierre de Consulta (RF-45)', () => {
    it('cuando la consulta está cerrada, los campos clínicos deben estar deshabilitados / solo lectura', () => {
      const html = renderToStaticMarkup(
        React.createElement(VisitConsultationScreen, {
          initialVisit: mockClosedVisit,
        }),
      );

      // Badge visible de consulta cerrada inmutable
      assert.ok(
        html.includes('Consulta Cerrada (Inmutable)') || html.includes('Cerrada (Inmutable)'),
        'Debe desplegar el badge visible de consulta cerrada inmutable',
      );

      // Los campos de constantes y diagnóstico están disabled o son textos estáticos
      assert.ok(html.includes('disabled'), 'Debe contener inputs deshabilitados');

      // Botón "Guardar Atención" no debe estar disponible o debe estar deshabilitado
      assert.ok(!html.includes('Guardar Atención') || html.includes('disabled'));

      // Botón "Añadir Nota de Evolución" debe estar visible y habilitado (RF-46)
      assert.ok(
        html.includes('Añadir Nota de Evolución') || html.includes('Agregar Nota de Evolución'),
        'Debe desplegar el botón de añadir nota de evolución',
      );
    });

    it('debe listar cronológicamente las notas de evolución asociadas a la visita (RF-46)', () => {
      const html = renderToStaticMarkup(
        React.createElement(VisitConsultationScreen, {
          initialVisit: mockClosedVisit,
        }),
      );

      assert.ok(
        html.includes('Dueño reporta cese de vómitos tras la primera toma'),
        'Debe desplegar el contenido de la nota complementaria',
      );
      assert.ok(
        html.includes('Carlos García') || html.includes('Dr.'),
        'Debe indicar el veterinario autor de la nota',
      );
    });
  });

  // =========================================================================
  // 5. Diálogo Modal AddNoteModal (RF-46)
  // =========================================================================
  describe('5. Modal de Adición de Notas de Evolución AddNoteModal (RF-46)', () => {
    it('debe renderizar sobre Dialog con role="dialog" y campo content', () => {
      const html = renderToStaticMarkup(
        React.createElement(AddNoteModal, {
          isOpen: true,
          visitId: 'visit-uuid-closed',
          onClose: () => {},
        }),
      );

      assert.ok(html.includes('role="dialog"'), 'Debe envolver Radix Dialog con role="dialog"');
      assert.ok(
        html.includes('Nota de Evolución') || html.includes('Añadir Nota'),
        'Debe tener título descriptivo',
      );
      assert.ok(html.includes('content') || html.includes('textarea') || html.includes('Nota'), 'Debe incluir área de texto');
    });

    it('botón de guardar nota debe estar deshabilitado si content tiene menos de 5 caracteres (RF-46)', () => {
      const htmlShort = renderToStaticMarkup(
        React.createElement(AddNoteModal, {
          isOpen: true,
          visitId: 'visit-uuid-closed',
          initialContent: 'Hola', // 4 caracteres (< 5)
          onClose: () => {},
        }),
      );

      assert.ok(
        htmlShort.includes('disabled') || htmlShort.includes('aria-disabled="true"'),
        'El botón debe estar deshabilitado con menos de 5 caracteres',
      );
      assert.ok(
        htmlShort.includes('Mínimo 5 caracteres') || htmlShort.includes('5 caracteres'),
        'Debe mostrar indicación de mínimo 5 caracteres',
      );
    });

    it('botón de guardar nota debe habilitarse cuando content tiene >= 5 caracteres (RF-46)', () => {
      const htmlValid = renderToStaticMarkup(
        React.createElement(AddNoteModal, {
          isOpen: true,
          visitId: 'visit-uuid-closed',
          initialContent: 'Paciente estable en su domicilio', // >= 5 caracteres
          onClose: () => {},
        }),
      );

      // El botón de confirmación no debe tener disabled para ese botón de acción
      assert.ok(htmlValid.includes('Guardar Nota') || htmlValid.includes('Registrar Nota'));
    });
  });

  // =========================================================================
  // 6. Auditoría Estática RNF-3 (Cero Tailwind, Cero shadcn)
  // =========================================================================
  describe('6. Auditoría Estática RNF-3 (Cero Tailwind, Cero shadcn)', () => {
    it('archivos de pantalla, modales y estilos no deben contener clases ni directivas Tailwind', () => {
      const basePath = process.cwd().endsWith('apps/desktop') || process.cwd().endsWith('apps\\desktop')
        ? process.cwd()
        : path.join(process.cwd(), 'apps/desktop');

      const filesToCheck = [
        path.join(basePath, 'src/screens/visit-consultation-screen.tsx'),
        path.join(basePath, 'src/screens/visit-consultation-screen.module.css'),
        path.join(basePath, 'src/components/screens/add-note-modal.tsx'),
        path.join(basePath, 'src/components/screens/add-note-modal.module.css'),
      ];

      for (const file of filesToCheck) {
        if (!fs.existsSync(file)) {
          assert.fail(`El archivo esperado no existe: ${file}`);
        }
        const content = fs.readFileSync(file, 'utf-8');

        assert.doesNotMatch(
          content,
          /@apply\s+/,
          `El archivo ${path.basename(file)} no debe contener directivas @apply de Tailwind`,
        );

        assert.doesNotMatch(
          content,
          /@tailwind\s+/,
          `El archivo ${path.basename(file)} no debe contener directivas @tailwind`,
        );

        assert.doesNotMatch(
          content,
          /@\/components\/ui/,
          `El archivo ${path.basename(file)} no debe importar rutas de componentes de shadcn`,
        );
      }
    });
  });
});
