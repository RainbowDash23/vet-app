import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PetSpecies, PetSex, ReproductiveStatus } from '@vet-app/shared-types';
import type {
  OwnerResponseDto,
  PetResponseDto,
} from '@vet-app/shared-types';

import { ApiClient, ApiError } from '../../src/services/api.client.ts';
import { OwnersService } from '../../src/services/owners.service.ts';
import { PetsService } from '../../src/services/pets.service.ts';
import { OwnerRegisterScreen } from '../../src/screens/OwnerRegisterScreen.tsx';
import { PetRegisterScreen } from '../../src/screens/PetRegisterScreen.tsx';

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

describe('Registro de Propietarios y Mascotas (RF-68, RF-69, RNF-3)', () => {
  describe('1. Servicio OwnersService (RF-68, RF-60)', () => {
    it('lookup debe llamar a POST /owners/lookup y retornar el estado de existencia sin filtrar datos personales', async () => {
      const mock = createMockFetch(async (url, init) => {
        if (url.includes('/owners/lookup')) {
          const body = JSON.parse(init?.body as string);
          if (body.documentId === '12345678') {
            return jsonResponse({ exists: true, pendingConsent: true });
          }
          return jsonResponse({ exists: false });
        }
        return jsonResponse({}, 404);
      });

      const client = new ApiClient({ fetchFn: mock.fn });
      const service = new OwnersService(client);

      const resExists = await service.lookup('12345678');
      assert.equal(resExists.exists, true);
      assert.equal(resExists.pendingConsent, true);

      const resNew = await service.lookup('99999999');
      assert.equal(resNew.exists, false);

      assert.equal(mock.calls.length, 2);
      assert.ok(mock.calls[0].url.includes('/owners/lookup'));
      assert.equal(mock.calls[0].options?.method, 'POST');
    });

    it('createOwner debe llamar a POST /owners con los datos sanitizados', async () => {
      let postedBody: any = null;
      const mock = createMockFetch(async (url, init) => {
        if (url.includes('/owners') && init?.method === 'POST') {
          postedBody = JSON.parse(init.body as string);
          return jsonResponse({
            id: 'owner-uuid-1',
            ...postedBody,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, 201);
        }
        return jsonResponse({}, 404);
      });

      const client = new ApiClient({ fetchFn: mock.fn });
      const service = new OwnersService(client);

      const created = await service.createOwner({
        documentId: ' 24567890 ',
        name: ' Carlos ',
        lastName: ' Mendoza ',
        phone: ' +584141234567 ',
        email: ' carlos@test.com ',
        address: ' Calle 1 ',
      });

      assert.equal(created.id, 'owner-uuid-1');
      assert.equal(postedBody.documentId, '24567890');
      assert.equal(postedBody.name, 'Carlos');
      assert.equal(postedBody.lastName, 'Mendoza');
    });

    it('createOwner debe capturar error 409 Conflict si el documentId ya está registrado', async () => {
      const mock = createMockFetch(async () => {
        return jsonResponse({ message: 'El documento ya está registrado' }, 409);
      });

      const client = new ApiClient({ fetchFn: mock.fn });
      const service = new OwnersService(client);

      await assert.rejects(
        async () => {
          await service.createOwner({
            documentId: '24567890',
            name: 'Carlos',
            lastName: 'Mendoza',
            phone: '+584141234567',
          });
        },
        (err: ApiError) => {
          assert.equal(err.status, 409);
          return true;
        }
      );
    });
  });

  describe('2. Servicio PetsService (RF-69, RF-17, RF-30)', () => {
    it('createPet debe enviar POST /pets con los datos de filiación', async () => {
      let petBody: any = null;
      const mock = createMockFetch(async (url, init) => {
        if (url.includes('/pets') && init?.method === 'POST') {
          petBody = JSON.parse(init.body as string);
          return jsonResponse({
            id: 'pet-uuid-1',
            ...petBody,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, 201);
        }
        return jsonResponse({}, 404);
      });

      const client = new ApiClient({ fetchFn: mock.fn });
      const service = new PetsService(client);

      const created = await service.createPet({
        name: 'Rocky',
        species: PetSpecies.CANINE,
        breed: 'Pastor Alemán',
        sex: PetSex.MALE,
        ownerId: 'owner-uuid-1',
        reproductiveStatus: ReproductiveStatus.INTACT,
      });

      assert.equal(created.id, 'pet-uuid-1');
      assert.equal(petBody.name, 'Rocky');
      assert.equal(petBody.species, PetSpecies.CANINE);
      assert.equal(petBody.ownerId, 'owner-uuid-1');
    });

    it('assignTag debe enviar POST /tags/assign con uid y petId', async () => {
      let tagBody: any = null;
      const mock = createMockFetch(async (url, init) => {
        if (url.includes('/tags/assign') && init?.method === 'POST') {
          tagBody = JSON.parse(init.body as string);
          return jsonResponse({ success: true, tag: tagBody });
        }
        return jsonResponse({}, 404);
      });

      const client = new ApiClient({ fetchFn: mock.fn });
      const service = new PetsService(client);

      await service.assignTag({ uid: '04A1B2C3D4E5', petId: 'pet-uuid-1' });

      assert.equal(tagBody.uid, '04A1B2C3D4E5');
      assert.equal(tagBody.petId, 'pet-uuid-1');
    });
  });

  describe('3. Pantalla OwnerRegisterScreen (RF-68, RNF-3)', () => {
    it('debe renderizar el título, campo de verificación de documento y campos de filiación', () => {
      const html = renderToStaticMarkup(React.createElement(OwnerRegisterScreen));

      assert.ok(html.includes('Alta de Propietario'), 'Debe incluir título principal');
      assert.ok(html.includes('Documento de Identidad'), 'Debe incluir label del documento');
      assert.ok(html.includes('Verificar'), 'Debe incluir botón de verificación');
      assert.ok(html.includes('Nombre'), 'Debe incluir campo nombre');
      assert.ok(html.includes('Apellidos'), 'Debe incluir campo apellidos');
      assert.ok(html.includes('Teléfono'), 'Debe incluir campo teléfono');
    });

    it('botón de guardar debe estar deshabilitado inicialmente hasta verificar documento', () => {
      const html = renderToStaticMarkup(React.createElement(OwnerRegisterScreen));
      assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'El botón debe estar deshabilitado sin verificación previa');
    });
  });

  describe('4. Pantalla PetRegisterScreen (RF-69, RNF-3)', () => {
    it('debe renderizar el formulario con selector de dueño, especies, constantes y campo de llavero NFC', () => {
      const html = renderToStaticMarkup(React.createElement(PetRegisterScreen, { initialNfcUid: '04A1B2C3' }));

      assert.ok(html.includes('Registrar Nueva Mascota'), 'Debe incluir título');
      assert.ok(html.includes('Propietario / Titular'), 'Debe incluir selector de propietario');
      assert.ok(html.includes('Nombre de la Mascota'), 'Debe incluir campo de nombre');
      assert.ok(html.includes('Especie'), 'Debe incluir selector de especie');
      assert.ok(html.includes('Canino (Perro)'), 'Debe incluir opción Canino');
      assert.ok(html.includes('UID del Llavero NFC'), 'Debe incluir campo para tag NFC');
      assert.ok(html.includes('value="04A1B2C3"'), 'Debe precargar el UID si se suministra');
    });
  });

  describe('5. Auditoría Estricta RNF-3 (Cero Tailwind, Cero shadcn en Pantallas de Registro)', () => {
    it('los archivos de pantallas y estilos de registro no deben contener Tailwind ni shadcn', () => {
      const filesToCheck = [
        'apps/desktop/src/screens/OwnerRegisterScreen.tsx',
        'apps/desktop/src/screens/OwnerRegisterScreen.module.css',
        'apps/desktop/src/screens/PetRegisterScreen.tsx',
        'apps/desktop/src/screens/PetRegisterScreen.module.css',
      ];

      for (const relPath of filesToCheck) {
        let fullPath = path.resolve(process.cwd(), relPath);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(process.cwd(), relPath.replace(/^apps\/desktop\//, ''));
        }
        assert.ok(fs.existsSync(fullPath), `El archivo ${relPath} debe existir en ${fullPath}`);
        const content = fs.readFileSync(fullPath, 'utf-8');

        assert.equal(
          content.includes('@tailwind'),
          false,
          `${relPath} no debe contener directivas @tailwind`
        );
        assert.equal(
          content.includes('@apply'),
          false,
          `${relPath} no debe contener @apply de Tailwind`
        );
        assert.equal(
          content.includes('@/components/ui'),
          false,
          `${relPath} no debe importar componentes de shadcn`
        );
      }
    });
  });
});
