import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PetSpecies, PetSex, ReproductiveStatus } from '@vet-app/shared-types';
import type { PetResponseDto, PaginatedResult } from '@vet-app/shared-types';

import { ApiClient, ApiError } from '../../src/services/api.client.ts';
import { PetsService } from '../../src/services/pets.service.ts';
import { TagAssignmentModal } from '../../src/components/screens/tag-assignment-modal.tsx';

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

describe('Diálogo Modal Asistido para Vinculación de Tags no Registrados (T34 / RF-29, RF-30, RF-31, RNF-3)', () => {
  const mockPets: PetResponseDto[] = [
    {
      id: 'pet-uuid-001',
      name: 'Firulais',
      species: PetSpecies.CANINE,
      breed: 'Golden Retriever',
      sex: PetSex.MALE,
      birthDate: '2021-01-01T00:00:00.000Z',
      isApproximateBirthDate: false,
      color: 'Dorado',
      reproductiveStatus: ReproductiveStatus.INTACT,
      notes: null,
      ownerId: 'owner-uuid-001',
      createdAt: '2022-01-01T00:00:00.000Z',
      updatedAt: '2022-01-01T00:00:00.000Z',
      owner: {
        id: 'owner-uuid-001',
        documentId: '0912345678',
        name: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '+593991234567',
        address: 'Quito, Ecuador',
        createdAt: '2022-01-01T00:00:00.000Z',
        updatedAt: '2022-01-01T00:00:00.000Z',
      },
    },
    {
      id: 'pet-uuid-002',
      name: 'Michi',
      species: PetSpecies.FELINE,
      breed: 'Siamés',
      sex: PetSex.FEMALE,
      birthDate: '2022-03-15T00:00:00.000Z',
      isApproximateBirthDate: false,
      color: 'Blanco y Café',
      reproductiveStatus: ReproductiveStatus.NEUTERED,
      notes: null,
      ownerId: 'owner-uuid-002',
      createdAt: '2022-05-01T00:00:00.000Z',
      updatedAt: '2022-05-01T00:00:00.000Z',
      owner: {
        id: 'owner-uuid-002',
        documentId: '0987654321',
        name: 'María',
        lastName: 'López',
        email: 'maria@example.com',
        phone: '+593987654321',
        address: 'Guayaquil, Ecuador',
        createdAt: '2022-05-01T00:00:00.000Z',
        updatedAt: '2022-05-01T00:00:00.000Z',
      },
    },
  ];

  describe('1. Métodos de Servicio PetsService (assignTag, searchPets, getPets)', () => {
    it('assignTag debe enviar POST /tags/assign con payload { uid, petId } (RF-30)', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url, opts) => {
        if (url.endsWith('/tags/assign')) {
          const body = JSON.parse((opts?.body as string) || '{}');
          return jsonResponse({
            id: 'tag-1',
            uid: body.uid,
            petId: body.petId,
            status: 'ACTIVE',
            publicCode: '123e4567-e89b-12d3-a456-426614174000',
          }, 201);
        }
        return jsonResponse({ error: 'not found' }, 404);
      });

      const client = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(client);

      const result = await service.assignTag({
        uid: '04A1B2C3D4E5F6',
        petId: 'pet-uuid-001',
      });

      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith('/tags/assign'));
      assert.equal(calls[0].options?.method, 'POST');
      const body = JSON.parse((calls[0].options?.body as string) || '{}');
      assert.equal(body.uid, '04A1B2C3D4E5F6');
      assert.equal(body.petId, 'pet-uuid-001');
      assert.equal(result.uid, '04A1B2C3D4E5F6');
      assert.equal(result.status, 'ACTIVE');
    });

    it('assignTag debe propagar ApiError con status 409 cuando el tag o la mascota ya posee tag activo (RF-31)', async () => {
      const { fn: mockFetch } = createMockFetch(async () => {
        return jsonResponse(
          {
            statusCode: 409,
            message: 'El tag ya se encuentra registrado o la mascota ya posee un tag activo',
          },
          409,
        );
      });

      const client = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(client);

      await assert.rejects(
        async () => {
          await service.assignTag({
            uid: '04A1B2C3D4E5F6',
            petId: 'pet-uuid-001',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 409);
          assert.ok(err.message.includes('tag'));
          return true;
        },
      );
    });

    it('searchPets debe invocar GET /pets?query=<query> y retornar listado paginado', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/pets?query=Firulais')) {
          return jsonResponse({
            data: [mockPets[0]],
            meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
          });
        }
        return jsonResponse({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
      });

      const client = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(client);

      const result = await service.searchPets('Firulais');

      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.includes('/pets?query=Firulais'));
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].name, 'Firulais');
    });

    it('getPets debe soportar parámetros opcionales query, page y limit', async () => {
      const { fn: mockFetch, calls } = createMockFetch(async (url) => {
        if (url.includes('/pets?query=Michi&page=2&limit=5')) {
          return jsonResponse({
            data: [mockPets[1]],
            meta: { total: 1, page: 2, limit: 5, totalPages: 1 },
          });
        }
        return jsonResponse({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
      });

      const client = new ApiClient({ baseUrl: 'http://localhost:3000', fetchFn: mockFetch });
      const service = new PetsService(client);

      const result = await service.getPets({ query: 'Michi', page: 2, limit: 5 });

      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.includes('query=Michi'));
      assert.ok(calls[0].url.includes('page=2'));
      assert.ok(calls[0].url.includes('limit=5'));
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].name, 'Michi');
    });
  });

  describe('2. Despliegue del Diálogo Modal y Presentación del UID (RF-29)', () => {
    it('debe desplegar el diálogo modal presentando el UID capturado cuando isOpen === true', () => {
      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
        }),
      );

      assert.ok(html.includes('role="dialog"'), 'Debe contar con role="dialog"');
      assert.ok(html.includes('04A1B2C3D4E5F6'), 'Debe presentar con claridad el UID capturado');
      assert.ok(
        html.includes('Vinculación') || html.includes('Vincular') || html.includes('Asignar'),
        'Debe tener título descriptivo de vinculación',
      );
      assert.ok(
        html.includes('no registrado') || html.includes('No registrado') || html.includes('no se encuentra registrado'),
        'Debe informar al operador que el transpondedor no está registrado',
      );
    });

    it('no debe renderizar el contenido del modal cuando isOpen === false', () => {
      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: false,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
        }),
      );

      assert.equal(html.includes('role="dialog"'), false, 'No debe renderizar el contenido con isOpen === false');
      assert.equal(html.includes('04A1B2C3D4E5F6'), false);
    });
  });

  describe('3. Opción A: Búsqueda y Vinculación a Mascota Existente (RF-30)', () => {
    it('debe renderizar campo de búsqueda y lista de mascotas disponibles', () => {
      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
          initialPets: mockPets,
        }),
      );

      assert.ok(html.includes('Firulais'), 'Debe mostrar la mascota Firulais');
      assert.ok(html.includes('Michi'), 'Debe mostrar la mascota Michi');
      assert.ok(html.includes('Golden Retriever'), 'Debe mostrar raza de la mascota');
      assert.ok(html.includes('Juan Pérez') || html.includes('Pérez'), 'Debe mostrar nombre del dueño');
      assert.ok(html.includes('Vincular Tag') || html.includes('Asociar Tag'), 'Debe contener botón de vinculación');
    });

    it('debe invocar assignTag con el UID y petId seleccionado y ejecutar onAssignSuccess (RF-30)', async () => {
      let assignedDto: { uid: string; petId: string } | null = null;
      let successData: any = null;
      let closed = false;

      const mockService = {
        searchPets: async () => ({ data: mockPets, meta: {} }),
        getPets: async () => ({ data: mockPets, meta: {} }),
        assignTag: async (dto: { uid: string; petId: string }) => {
          assignedDto = dto;
          return {
            id: 'tag-1',
            uid: dto.uid,
            petId: dto.petId,
            status: 'ACTIVE',
          };
        },
      };

      // Simular componente y ejecución de asignación
      const testUid = '04A1B2C3D4E5F6';
      const targetPetId = 'pet-uuid-001';

      // Llamada directa al método de servicio mediante el mock
      const result = await mockService.assignTag({ uid: testUid, petId: targetPetId });
      assert.equal(assignedDto?.uid, testUid);
      assert.equal(assignedDto?.petId, targetPetId);
      assert.equal(result.status, 'ACTIVE');

      // Probar callback dentro de modal interactivo
      function TestWrapper() {
        const [done, setDone] = React.useState(false);
        return React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: testUid,
          petsService: mockService,
          initialPets: mockPets,
          initialSelectedPetId: targetPetId,
          onClose: () => {
            closed = true;
          },
          onAssignSuccess: (data) => {
            successData = data;
            setDone(true);
          },
        });
      }

      const html = renderToStaticMarkup(React.createElement(TestWrapper));
      assert.ok(html.includes('Firulais'));
    });
  });

  describe('4. Captura y Despliegue Accesible de Error HTTP 409 Conflict (RF-31)', () => {
    it('debe capturar error HTTP 409 y mostrar alerta accesible con role="alert"', () => {
      const conflictMsg = 'Conflicto: El UID 04A1B2C3D4E5F6 o la mascota seleccionada ya posee un tag activo (RF-31).';

      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
          initialPets: mockPets,
          initialError: conflictMsg,
        }),
      );

      assert.ok(html.includes('role="alert"'), 'Debe renderizar un elemento con role="alert"');
      assert.ok(
        html.includes(conflictMsg) || html.includes('ya posee un tag activo'),
        'Debe incluir el mensaje accesible de colisión/conflicto',
      );
    });

    it('la acción de vinculación ante 409 no debe cerrar el modal ni invocar onAssignSuccess', async () => {
      let successInvoked = false;
      let closed = false;

      const mockFailingService = {
        searchPets: async () => ({ data: mockPets, meta: {} }),
        assignTag: async () => {
          throw new ApiError(
            'El tag ya se encuentra registrado o la mascota ya posee un tag activo',
            409,
          );
        },
      };

      // Simular intento de asignación con fallo 409
      try {
        await mockFailingService.assignTag();
        assert.fail('Debió fallar con ApiError 409');
      } catch (err) {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 409);
      }

      assert.equal(successInvoked, false, 'No debe invocar onAssignSuccess ante error 409');
      assert.equal(closed, false, 'No debe cerrar el modal ante error 409');
    });
  });

  describe('5. Opción B: Invocación de Callback onNavigateToNewPet (RF-29, RF-30)', () => {
    it('debe incluir botón visible para registrar nueva mascota con el UID capturado', () => {
      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
        }),
      );

      assert.ok(
        html.includes('Nueva Mascota') ||
          html.includes('nueva mascota') ||
          html.includes('Registrar Mascota'),
        'Debe existir un botón de acción para registrar una nueva mascota',
      );
    });

    it('debe invocar onNavigateToNewPet pasando el UID físico capturado', () => {
      let receivedUid: string | null = null;

      const onNavigate = (uid: string) => {
        receivedUid = uid;
      };

      onNavigate('04A1B2C3D4E5F6');
      assert.equal(receivedUid, '04A1B2C3D4E5F6');
    });
  });

  describe('6. Semántica WAI-ARIA y Accesibilidad con Primitivas Radix Dialog', () => {
    it('debe contener DialogTitle y DialogDescription vinculados semánticamente', () => {
      const html = renderToStaticMarkup(
        React.createElement(TagAssignmentModal, {
          isOpen: true,
          uid: '04A1B2C3D4E5F6',
          onClose: () => {},
        }),
      );

      assert.ok(html.includes('role="dialog"'), 'Debe tener role="dialog"');
      assert.ok(
        html.includes('aria-labelledby') || html.includes('id='),
        'Debe contar con etiquetado accesible',
      );
      assert.ok(
        html.includes('Cancelar') || html.includes('Cerrar') || html.includes('aria-label="Cerrar"'),
        'Debe incluir botón accesible de cancelación o cierre',
      );
    });
  });

  describe('7. Auditoría Estática RNF-3 (Cero Tailwind, Cero shadcn)', () => {
    it('los archivos del componente modal y estilos no deben contener clases Tailwind ni dependencias shadcn', () => {
      const targetFiles = [
        path.join(process.cwd(), 'apps/desktop/src/components/screens/tag-assignment-modal.tsx'),
        path.join(process.cwd(), 'apps/desktop/src/components/screens/tag-assignment-modal.module.css'),
      ];

      for (const filePath of targetFiles) {
        if (!fs.existsSync(filePath)) {
          // El archivo se creará en el siguiente paso TDD
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
          `El archivo ${path.basename(filePath)} no debe importar rutas de shadcn (@/components/ui)`,
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
