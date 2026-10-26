import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  PetSpecies,
  PetSex,
  ReproductiveStatus,
  TagStatus,
  VisitStatus,
  Role,
} from '@vet-app/shared-types';
import type {
  PetResponseDto,
  PetMinimalFiliationDto,
  ResolveTagSuccessDto,
  ResolveTagUnregisteredDto,
  VisitResponseDto,
  PaginatedResult,
} from '@vet-app/shared-types';

import { ApiClient } from '../../src/services/api.client.ts';
import { PetsService, type VaccinationRecord } from '../../src/services/pets.service.ts';
import { PatientFileScreen } from '../../src/screens/patient-file-screen.tsx';
import { fakeTagReader } from '../../src/readers/fake-tag-reader.ts';
import type { DirtyGuardState } from '../../src/hooks/use-form-dirty-guard.ts';

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

describe('Ficha Clínica de Paciente Activada por Escaneo NFC (T33 / RF-21, RF-23, RF-28, RNF-5, RNF-3)', () => {
  beforeEach(() => {
    fakeTagReader.stop();
    fakeTagReader.start();
  });

  const mockFullPet: PetResponseDto = {
    id: 'pet-123',
    name: 'Max',
    species: PetSpecies.CANINE,
    breed: 'Golden Retriever',
    sex: PetSex.MALE,
    birthDate: '2021-05-10T00:00:00.000Z',
    isApproximateBirthDate: false,
    color: 'Dorado',
    reproductiveStatus: ReproductiveStatus.INTACT,
    notes: 'Alérgico al polen',
    ownerId: 'owner-456',
    createdByClinicId: 'clinic-789',
    createdAt: '2022-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    owner: {
      id: 'owner-456',
      documentId: '0912345678',
      name: 'Carlos',
      lastName: 'Mendoza',
      email: 'carlos@example.com',
      phone: '+593991234567',
      address: 'Av. Siempre Viva 123',
      createdAt: '2022-01-01T00:00:00.000Z',
      updatedAt: '2022-01-01T00:00:00.000Z',
    },
  };

  const mockMinimalPet: PetMinimalFiliationDto = {
    name: 'Luna',
    species: PetSpecies.FELINE,
    breed: 'Siamés',
    sex: PetSex.FEMALE,
    ownerPhone: '+593987654321',
    tagStatus: TagStatus.ACTIVE,
    ownerName: 'María Gómez',
  };

  const mockVisits: PaginatedResult<VisitResponseDto> = {
    data: [
      {
        id: 'visit-1',
        clinicId: 'clinic-789',
        vetId: 'vet-1',
        petId: 'pet-123',
        reason: 'Control anual y chequeo general',
        notes: 'Paciente alerta y en buen estado general',
        diagnosis: 'Paciente clínicamente sano',
        treatment: 'Plan de desparasitación interna',
        weight: 32.5,
        temperature: 38.6,
        heartRate: 110,
        respiratoryRate: 24,
        capillaryRefillTime: 1.5,
        startTime: '2026-03-15T10:00:00.000Z',
        durationMinutes: 30,
        endTime: '2026-03-15T10:30:00.000Z',
        status: VisitStatus.SCHEDULED,
        closedAt: '2026-03-15T10:30:00.000Z',
        createdAt: '2026-03-15T09:50:00.000Z',
        updatedAt: '2026-03-15T10:30:00.000Z',
        veterinarian: {
          id: 'vet-1',
          clinicId: 'clinic-789',
          email: 'dr.vet@clinic.com',
          name: 'Alejandro',
          lastName: 'Soto',
          role: 'VET' as any,
          phone: '+593990001111',
          isActive: true,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        visitNotes: [
          {
            id: 'note-1',
            visitId: 'visit-1',
            vetId: 'vet-1',
            note: 'Se observó buena respuesta a palpación abdominal.',
            createdAt: '2026-03-15T10:20:00.000Z',
            veterinarian: {
              id: 'vet-1',
              clinicId: 'clinic-789',
              email: 'dr.vet@clinic.com',
              name: 'Alejandro',
              lastName: 'Soto',
              role: 'VET' as any,
              isActive: true,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          },
        ],
      },
    ],
    meta: {
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };

  const mockVaccinations: PaginatedResult<VaccinationRecord> = {
    data: [
      {
        id: 'vac-1',
        petId: 'pet-123',
        vaccineName: 'Séxtuple Canina (DHPPiL)',
        batchNumber: 'LOT-2026-X9',
        appliedAt: '2026-02-10T11:00:00.000Z',
        nextDueDate: '2027-02-10T11:00:00.000Z',
        notes: 'Sin reacciones adversas inmediatas',
        clinic: { id: 'clinic-789', name: 'Clínica San Francisco' },
        veterinarian: { id: 'vet-1', name: 'Dr. Alejandro Soto' },
      },
    ],
    meta: {
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };

  describe('1. Servicio PetsService (pets.service.ts)', () => {
    it('resolveTag(uid) debe llamar a GET /tags/resolve/:uid con Bearer token (RF-28)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/tags/resolve/04A1B2C3D4E5F6')) {
          const successDto: ResolveTagSuccessDto = {
            registered: true,
            uid: '04A1B2C3D4E5F6',
            pet: mockFullPet,
            hasFullAccess: true,
            grant: {
              id: 'grant-1',
              petId: 'pet-123',
              clinicId: 'clinic-789',
              source: 'NFC_TAP' as any,
              scope: 'FULL_HISTORY' as any,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          };
          return jsonResponse(successDto);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      apiClient.setTokens('mock-access-token', 'mock-refresh-token');
      const service = new PetsService(apiClient);

      const res = await service.resolveTag('04A1B2C3D4E5F6');

      assert.equal(res.registered, true);
      assert.equal((res as ResolveTagSuccessDto).uid, '04A1B2C3D4E5F6');
      assert.equal((res as ResolveTagSuccessDto).hasFullAccess, true);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith('/tags/resolve/04A1B2C3D4E5F6'));
      const authHeader = new Headers(calls[0].options?.headers).get('Authorization');
      assert.equal(authHeader, 'Bearer mock-access-token');
    });

    it('resolveTag(uid) debe manejar 404 de tag no registrado retornando registered: false (RF-29)', async () => {
      const { fn: mockFetch } = createMockFetch(async () => {
        return jsonResponse({ registered: false, uid: '04FFFFFFFFFFFF' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const res = await service.resolveTag('04FFFFFFFFFFFF');

      assert.equal(res.registered, false);
      assert.equal((res as ResolveTagUnregisteredDto).uid, '04FFFFFFFFFFFF');
    });

    it('getPetById(id) debe llamar a GET /pets/:id', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/pets/pet-123')) {
          return jsonResponse(mockFullPet);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const pet = await service.getPetById('pet-123');

      assert.equal(pet.id, 'pet-123');
      assert.equal(pet.name, 'Max');
      assert.ok(calls[0].url.endsWith('/pets/pet-123'));
    });

    it('getMedicalHistory(petId, page, limit) debe llamar a GET /visits/history/pet/:petId (RF-47)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/visits/history/pet/pet-123')) {
          return jsonResponse(mockVisits);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const history = await service.getMedicalHistory('pet-123', 1, 10);

      assert.equal(history.data.length, 1);
      assert.equal(history.data[0].diagnosis, 'Paciente clínicamente sano');
      assert.ok(calls[0].url.includes('/visits/history/pet/pet-123'));
      assert.ok(calls[0].url.includes('page=1'));
      assert.ok(calls[0].url.includes('limit=10'));
    });

    it('getVaccinations(petId, page, limit) debe llamar a GET /vaccinations/pet/:petId (RF-48)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/vaccinations/pet/pet-123')) {
          return jsonResponse(mockVaccinations);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const vacs = await service.getVaccinations('pet-123', 1, 10);

      assert.equal(vacs.data.length, 1);
      assert.equal(vacs.data[0].vaccineName, 'Séxtuple Canina (DHPPiL)');
      assert.ok(calls[0].url.includes('/vaccinations/pet/pet-123'));
    });

    it('getTagsByPet(petId) debe llamar a GET /tags/pet/:petId (RF-61)', async () => {
      const mockTags = [
        {
          id: 'tag-1',
          uid: '04A1B2C3D4E5F6',
          publicCode: 'PUB-1234-CODE',
          status: TagStatus.ACTIVE,
          petId: 'pet-123',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ];

      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/tags/pet/pet-123')) {
          return jsonResponse(mockTags);
        }
        return jsonResponse({ message: 'Not found' }, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const tags = await service.getTagsByPet('pet-123');

      assert.equal(tags.length, 1);
      assert.equal(tags[0].publicCode, 'PUB-1234-CODE');
      assert.ok(calls[0].url.includes('/tags/pet/pet-123'));
    });
  });

  describe('2. Latencia y Benchmark de Resolución (<600 ms, RNF-5)', () => {
    it('la resolución completa de tag y obtención de ficha médica debe ejecutarse en menos de 600 ms', async () => {
      // Simular latencia de red de 20 ms
      const { fn: mockFetch } = createMockFetch(async (url) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (url.includes('/tags/resolve/')) {
          return jsonResponse({
            registered: true,
            uid: '04A1B2C3D4E5F6',
            pet: mockFullPet,
            hasFullAccess: true,
          });
        }
        if (url.includes('/visits/history/pet/')) {
          return jsonResponse(mockVisits);
        }
        if (url.includes('/vaccinations/pet/')) {
          return jsonResponse(mockVaccinations);
        }
        return jsonResponse({}, 404);
      });

      const apiClient = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(apiClient);

      const start = performance.now();
      const tagResult = await service.resolveTag('04A1B2C3D4E5F6');
      assert.equal(tagResult.registered, true);

      if (tagResult.registered && tagResult.hasFullAccess) {
        const petId = (tagResult.pet as PetResponseDto).id;
        await Promise.all([
          service.getMedicalHistory(petId),
          service.getVaccinations(petId),
        ]);
      }
      const durationMs = performance.now() - start;

      assert.ok(
        durationMs < 600,
        `El tiempo de resolución (${durationMs.toFixed(2)} ms) debe ser estrictamente inferior a 600 ms (RNF-5)`
      );
    });
  });

  describe('3. Despliegue con Datos Mínimos de Filiación (RF-21, hasFullAccess === false)', () => {
    it('debe renderizar datos mínimos de filiación y ocultar historia clínica, diagnósticos y constantes', () => {
      const minimalData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04MINIMAL12345',
        pet: mockMinimalPet,
        hasFullAccess: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: minimalData,
          autoListenNfc: false,
        })
      );

      // Debe incluir datos mínimos
      assert.ok(html.includes('Luna'), 'Debe mostrar nombre de la mascota');
      assert.ok(html.includes('FELINE') || html.includes('Felino') || html.includes('Gato'), 'Debe mostrar especie');
      assert.ok(html.includes('Siamés'), 'Debe mostrar raza');
      assert.ok(html.includes('+593987654321'), 'Debe mostrar teléfono del dueño');
      assert.ok(html.includes('ACTIVE') || html.includes('Activo'), 'Debe mostrar estado del tag');

      // Debe advertir sobre consentimiento restringido (RF-21)
      assert.ok(
        html.includes('Acceso restringido') ||
          html.includes('consentimiento') ||
          html.includes('datos mínimos') ||
          html.includes('RF-21'),
        'Debe alertar sobre acceso restringido a datos mínimos de filiación'
      );

      // NO debe desplegar historial médico ni diagnósticos ni constantes
      assert.ok(!html.includes('Paciente clínicamente sano'), 'No debe revelar diagnósticos');
      assert.ok(!html.includes('Séxtuple Canina'), 'No debe revelar vacunas');
      assert.ok(!html.includes('TLLC'), 'No debe revelar constantes vitales');
    });
  });

  describe('4. Despliegue de Historia Clínica Completa ante AccessGrant Vigente (RF-23, hasFullAccess === true)', () => {
    const fullData: ResolveTagSuccessDto = {
      registered: true,
      uid: '04A1B2C3D4E5F6',
      pet: mockFullPet,
      hasFullAccess: true,
    };

    it('a) debe renderizar datos del paciente y constantes vitales recientes en pestaña de resumen', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: fullData,
          initialVisits: mockVisits.data,
          initialVaccinations: mockVaccinations.data,
          initialTab: 'summary',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Max'), 'Debe mostrar nombre del paciente');
      assert.ok(html.includes('Golden Retriever'), 'Debe mostrar raza');
      assert.ok(html.includes('Carlos Mendoza'), 'Debe mostrar dueño');
      assert.ok(html.includes('32.5') || html.includes('Peso'), 'Debe incluir peso');
      assert.ok(html.includes('38.6') || html.includes('Temperatura'), 'Debe incluir temperatura');
      assert.ok(html.includes('110') || html.includes('FC'), 'Debe incluir FC');
      assert.ok(html.includes('24') || html.includes('FR'), 'Debe incluir FR');
      assert.ok(html.includes('1.5') || html.includes('TLLC'), 'Debe incluir TLLC');
      assert.ok(html.includes('role="tablist"'), 'Debe contar con semántica accesible de pestañas');
    });

    it('b) debe renderizar historial de consultas médicas con diagnósticos y notas (RF-23, RF-47)', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: fullData,
          initialVisits: mockVisits.data,
          initialVaccinations: mockVaccinations.data,
          initialTab: 'history',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Control anual y chequeo general'), 'Debe mostrar motivo de consulta');
      assert.ok(html.includes('Paciente clínicamente sano'), 'Debe mostrar diagnóstico');
      assert.ok(html.includes('Plan de desparasitación interna'), 'Debe mostrar tratamiento');
      assert.ok(html.includes('Alejandro Soto'), 'Debe mostrar veterinario actuante');
      assert.ok(html.includes('Se observó buena respuesta a palpación abdominal.'), 'Debe mostrar notas de evolución');
    });

    it('c) debe renderizar carnet de vacunación con próximos refuerzos (RF-48)', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: fullData,
          initialVisits: mockVisits.data,
          initialVaccinations: mockVaccinations.data,
          initialTab: 'vaccines',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Séxtuple Canina (DHPPiL)'), 'Debe mostrar vacuna');
      assert.ok(html.includes('LOT-2026-X9'), 'Debe mostrar lote');
      assert.ok(html.includes('2027'), 'Debe indicar próximo refuerzo');
    });
  });

  describe('5. Manejo de Tag no Registrado (RF-29)', () => {
    it('debe desplegar estado accesible de tag no registrado y botón para vincular', () => {
      const unregisteredDto: ResolveTagUnregisteredDto = {
        registered: false,
        uid: '04NONREGISTERED',
      };

      let unregisteredInvokedWith: string | null = null;
      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialUnregistered: unregisteredDto,
          onUnregisteredTag: (uid) => {
            unregisteredInvokedWith = uid;
          },
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('04NONREGISTERED'), 'Debe mostrar el UID del tag no registrado');
      assert.ok(
        html.includes('no registrado') || html.includes('No Registrado') || html.includes('Sin registrar'),
        'Debe informar que el tag no está registrado'
      );
      assert.ok(
        html.includes('Vincular') || html.includes('Asignar'),
        'Debe ofrecer botón de vinculación'
      );
    });
  });

  describe('6. Escaneo NFC Reactivo y DirtyGuard (RF-33)', () => {
    it('si DirtyGuard tiene isDirty === true, la lectura NFC es interceptada sin resolver', () => {
      let interceptInvoked = false;
      const mockDirtyGuard: DirtyGuardState = {
        isDirty: true,
        setIsDirty: () => {},
        setDirtyState: () => {},
        pendingUid: null,
        showUnsavedDialog: false,
        handleTagDetected: (uid: string) => {
          interceptInvoked = true;
          return false;
        },
        confirmDiscard: () => {},
        cancelDiscard: () => {},
        resetGuard: () => {},
      };

      let resolveCalled = false;
      const mockService = {
        resolveTag: async () => {
          resolveCalled = true;
          return { registered: false as const, uid: 'TEST' };
        },
        getPetById: async () => mockFullPet,
        getMedicalHistory: async () => mockVisits,
        getVaccinations: async () => mockVaccinations,
      } as unknown as PetsService;

      renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          dirtyGuard: mockDirtyGuard,
          petsService: mockService,
          autoListenNfc: true,
        })
      );

      // Simular escaneo NFC mientras DirtyGuard está sucio
      fakeTagReader.emitTag('04A1B2C3D4E5F6');

      assert.equal(interceptInvoked, true, 'DirtyGuard debe haber interceptado la lectura');
      assert.equal(resolveCalled, false, 'No debe llamar a resolveTag mientras el formulario esté sucio (RF-33)');
    });
  });

  describe('7. Auditoría Estricta RNF-3 (Cero Tailwind, Cero shadcn)', () => {
    it('los archivos del componente patient-file-screen no deben contener clases de Tailwind ni dependencias de shadcn', () => {
      const baseDir = path.resolve(import.meta.dirname ?? '.', '../../src');
      const tsxPath = path.join(baseDir, 'screens/patient-file-screen.tsx');
      const cssPath = path.join(baseDir, 'screens/patient-file-screen.module.css');
      const servicePath = path.join(baseDir, 'services/pets.service.ts');

      const files = [tsxPath, cssPath, servicePath];
      const tailwindRegex = /\b(p-[0-9]|m-[0-9]|text-(red|blue|gray|teal)-[0-9]{2,3}|flex-(row|col)|bg-(slate|gray|zinc|neutral|stone)-[0-9]{2,3}|rounded-(sm|md|lg|xl))\b/;

      for (const filePath of files) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');

        assert.ok(
          !content.includes('@tailwind'),
          `El archivo ${path.basename(filePath)} no debe incluir directivas @tailwind`
        );
        assert.ok(
          !content.includes('@shadcn'),
          `El archivo ${path.basename(filePath)} no debe incluir referencias a shadcn`
        );
        assert.ok(
          !tailwindRegex.test(content),
          `El archivo ${path.basename(filePath)} no debe contener clases de utilidad de Tailwind CSS`
        );
      }
    });
  });

  describe('8. Visualización de Código Público, Información Técnica y Roster (SPEC EARS)', () => {
    it('debe mostrar el código público dentro de Información técnica plegada cuando el usuario es ADMIN de la clínica de origen', () => {
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        publicCode: 'PUB-EMERGENCY-999',
        pet: mockFullPet, // createdByClinicId === 'clinic-789'
        hasFullAccess: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'clinic-789', // Misma clínica creadora
          currentUserRole: Role.ADMIN,
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Información técnica'), 'Debe incluir bloque plegado Información técnica');
      assert.ok(html.includes('PUB-EMERGENCY-999'), 'Debe mostrar el código público');
      assert.ok(html.includes('http://localhost:3000/p/PUB-EMERGENCY-999'), 'Debe mostrar la URL completa de emergencia');
      assert.ok(html.includes('Copiar enlace'), 'Debe incluir botón para copiar enlace');
    });

    it('no debe mostrar el bloque de información técnica si el usuario no es ADMIN', () => {
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        publicCode: 'PUB-EMERGENCY-999',
        pet: mockFullPet,
        hasFullAccess: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'clinic-789',
          currentUserRole: Role.VET, // Rol VET no es ADMIN
          autoListenNfc: false,
        })
      );

      assert.ok(!html.includes('Información técnica'), 'No debe mostrar bloque de información técnica a no ADMIN');
      assert.ok(!html.includes('PUB-EMERGENCY-999'), 'No debe mostrar código público a no ADMIN');
    });

    it('no debe mostrar el código público ni URL de emergencia si la clínica es diferente (cross-tenant)', () => {
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        pet: mockFullPet, // createdByClinicId === 'clinic-789'
        hasFullAccess: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'other-clinic-uuid', // Clínica ajena
          currentUserRole: Role.ADMIN,
          autoListenNfc: false,
        })
      );

      assert.ok(!html.includes('emergencyCard'), 'No debe renderizar la tarjeta de emergencia');
      assert.ok(!html.includes('PUB-EMERGENCY-999'), 'No debe exponer el código público cross-tenant');
      assert.ok(!html.includes('Copiar enlace'), 'No debe exponer el botón de copiar enlace');
    });

    it('debe indicar el tiempo restante del AccessGrant cuando el acceso es por escaneo temporal', () => {
      const expiresAt = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(); // 14 horas restantes
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        pet: mockFullPet,
        hasFullAccess: true,
        activeGrant: {
          id: 'grant-123',
          expiresAt,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'other-clinic-uuid',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Vence en 14 h'), 'Debe mostrar el tiempo restante de acceso');
    });

    it('debe indicar si el paciente pertenece o no a la clínica actual y mostrar botón agregar a mis pacientes en clínica ajena', () => {
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        pet: mockFullPet, // createdByClinicId: 'clinic-789'
        hasFullAccess: true,
        isInRoster: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'other-clinic-uuid',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Paciente externo'), 'Debe indicar que es paciente externo');
      assert.ok(html.includes('Agregar a mis pacientes'), 'Debe mostrar botón para agregar a mis pacientes');
    });

    it('debe mostrar el badge de paciente de su clínica cuando isInRoster es true', () => {
      const successData: ResolveTagSuccessDto = {
        registered: true,
        uid: '04A1B2C3D4E5F6',
        pet: mockFullPet,
        hasFullAccess: true,
        isInRoster: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(PatientFileScreen, {
          initialData: successData,
          currentClinicId: 'clinic-789',
          autoListenNfc: false,
        })
      );

      assert.ok(html.includes('Paciente de su clínica'), 'Debe mostrar badge Paciente de su clínica');
      assert.ok(!html.includes('Agregar a mis pacientes'), 'No debe mostrar botón de agregar si ya pertenece a la clínica');
    });
  });
});
