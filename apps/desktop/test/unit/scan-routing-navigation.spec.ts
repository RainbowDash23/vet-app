import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary, ResolveTagSuccessDto } from '@vet-app/shared-types';

import { AuthProvider } from '../../src/context/auth.context.tsx';
import { App, AppContent } from '../../src/App.tsx';
import { Header } from '../../src/components/layout/header.tsx';
import { UnsavedChangesDialog } from '../../src/components/screens/unsaved-changes-dialog.tsx';
import { PatientFileScreen } from '../../src/screens/patient-file-screen.tsx';
import { VisitConsultationScreen } from '../../src/screens/visit-consultation-screen.tsx';
import { fakeTagReader } from '../../src/readers/fake-tag-reader.ts';
import { ApiClient, ApiError } from '../../src/services/api.client.ts';
import { PetsService } from '../../src/services/pets.service.ts';

describe('Flujo de Escaneo NFC, Navegación y Branding Institucional (PASO 8 / RF-70, RT-2, RNF-3)', () => {
  describe('1. Branding Institucional en Cabecera (Nombre Comercial vs ID)', () => {
    it('Header debe renderizar el nombre comercial de la clínica y no exponer su ID interno', () => {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          clinicName: 'Clínica Veterinaria San Antón',
          userName: 'Dra. María González',
          role: Role.VET,
        })
      );

      assert.ok(html.includes('Clínica Veterinaria San Antón'), 'Debe mostrar el nombre comercial');
      assert.equal(html.includes('Clínica ('), false, 'No debe mostrar formato de ID');
      assert.equal(html.includes('clinic-uuid'), false, 'No debe filtrar UUIDs');
    });

    it('Header debe contar con un fallback amigable si no se provee clinicName', () => {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          userName: 'Dra. María',
        })
      );

      assert.ok(html.includes('Clínica Veterinaria Central'), 'Debe usar fallback institucional');
      assert.equal(html.includes('undefined'), false);
    });
  });

  describe('2. Enrutamiento de Pantallas en App (PatientFileScreen y VisitConsultationScreen)', () => {
    it('debe enrutar PatientFileScreen cuando activeScreen sea clinical-record', () => {
      const mockUser: AuthUserSummary = {
        id: 'vet-uuid-1',
        email: 'vet@test.com',
        name: 'Dr. Roberto',
        role: Role.VET,
        clinicId: 'clinic-uuid-1',
      };

      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: mockUser },
          React.createElement(AppContent, { initialScreen: 'clinical-record' })
        )
      );

      assert.ok(
        html.includes('Ficha Clínica') || html.includes('patientFile') || html.includes('Resumen del Paciente'),
        'Debe renderizar la pantalla PatientFileScreen'
      );
    });

    it('debe enrutar VisitConsultationScreen cuando activeScreen sea care-vaccination', () => {
      const mockUser: AuthUserSummary = {
        id: 'vet-uuid-1',
        email: 'vet@test.com',
        name: 'Dr. Roberto',
        role: Role.VET,
        clinicId: 'clinic-uuid-1',
      };

      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: mockUser },
          React.createElement(AppContent, { initialScreen: 'care-vaccination' })
        )
      );

      assert.ok(
        html.includes('Consulta Médica') || html.includes('Atención') || html.includes('Anamnesis'),
        'Debe renderizar la pantalla VisitConsultationScreen'
      );
    });
  });

  describe('3. Flujo Lógico de Escaneo NFC y Resolución de Tag (RF-70, RT-2)', () => {
    it('resolveTag con tag registrado debe resolver y retornar ficha clínica', async () => {
      let resolvedUid = '';
      const mockFetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/tags/resolve/')) {
          resolvedUid = url.split('/').pop() || '';
          return new Response(
            JSON.stringify({
              registered: true,
              uid: resolvedUid,
              pet: { id: 'pet-123', name: 'Max', species: 'CANINE' },
              grantActive: true,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      };

      const client = new ApiClient({ fetchFn: mockFetch as unknown as typeof fetch });
      const service = new PetsService(client);

      const result = await service.resolveTag('04A1B2C3');
      assert.equal(result.registered, true);
      assert.equal(resolvedUid, '04A1B2C3');
      assert.equal((result as ResolveTagSuccessDto).pet?.name, 'Max');
    });

    it('resolveTag con tag no registrado (404) debe retornar registered false con el UID', async () => {
      const mockFetch = async (input: RequestInfo | URL) => {
        return new Response(
          JSON.stringify({
            registered: false,
            uid: '04DEADBEEF',
            message: 'Tag no registrado',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new ApiClient({ fetchFn: mockFetch as unknown as typeof fetch });
      const service = new PetsService(client);

      const result = await service.resolveTag('04DEADBEEF');
      assert.equal(result.registered, false);
      assert.equal(result.uid, '04DEADBEEF');
    });

    it('resolveTag con tag revocado (403) debe lanzar ApiError con status 403', async () => {
      const mockFetch = async (input: RequestInfo | URL) => {
        return new Response(
          JSON.stringify({
            statusCode: 403,
            message: 'El consentimiento ha sido REVOCADO para este paciente',
            error: 'Forbidden',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new ApiClient({ fetchFn: mockFetch as unknown as typeof fetch });
      const service = new PetsService(client);

      await assert.rejects(
        async () => {
          await service.resolveTag('04REVOKED12');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 403);
          return true;
        }
      );
    });
  });

  describe('4. Interrupción de Escaneo Concurrente ante Cambios No Guardados (UnsavedChangesDialog)', () => {
    it('UnsavedChangesDialog debe ser accesible y alertar sobre pérdida de datos', () => {
      const html = renderToStaticMarkup(
        React.createElement(UnsavedChangesDialog, {
          isOpen: true,
          pendingUid: '04PENDING1',
          onConfirm: () => {},
          onCancel: () => {},
        })
      );

      assert.ok(html.includes('role="alertdialog"'), 'Debe tener semántica WAI-ARIA role="alertdialog"');
      assert.ok(html.includes('04PENDING1'), 'Debe mostrar el UID interceptado');
      assert.ok(html.includes('Confirmar y Descartar'), 'Debe contener botón para confirmar descarte');
      assert.ok(html.includes('Permanecer en el formulario'), 'Debe contener botón para permanecer/cancelar');
    });
  });

  describe('5. Auditoría RNF-3 (Cero Tailwind, Cero shadcn en App y Layout)', () => {
    it('App.tsx y componentes relacionados no deben importar Tailwind ni shadcn', () => {
      const files = [
        'apps/desktop/src/App.tsx',
        'apps/desktop/src/components/layout/main-layout.tsx',
        'apps/desktop/src/components/layout/header.tsx',
      ];

      for (const relPath of files) {
        let fullPath = path.resolve(process.cwd(), relPath);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(process.cwd(), relPath.replace(/^apps\/desktop\//, ''));
        }
        assert.ok(fs.existsSync(fullPath), `El archivo ${relPath} debe existir en ${fullPath}`);
        const content = fs.readFileSync(fullPath, 'utf-8');

        assert.equal(content.includes('@tailwind'), false, `${relPath} no debe contener @tailwind`);
        assert.equal(content.includes('@apply'), false, `${relPath} no debe contener @apply`);
        assert.equal(content.includes('@/components/ui'), false, `${relPath} no debe importar shadcn`);
      }
    });
  });
});
