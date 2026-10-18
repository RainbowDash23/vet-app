import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { fakeTagReader } from '../../src/readers/fake-tag-reader.ts';
import { useNfcReader } from '../../src/hooks/use-nfc-reader.ts';
import {
  useFormDirtyGuard,
  DirtyGuardProvider,
  useDirtyGuard,
} from '../../src/hooks/use-form-dirty-guard.ts';
import { UnsavedChangesDialog } from '../../src/components/screens/unsaved-changes-dialog.tsx';

describe('Hook de Escucha NFC y Guardia de Navegación ante Cambios no Guardados (T32 / RF-33 / RNF-3)', () => {
  beforeEach(() => {
    // Limpiar estado global del simulador de tags antes de cada prueba
    fakeTagReader.stop();
    fakeTagReader.start();
  });

  describe('1. Hook de escucha NFC useNfcReader', () => {
    it('debe suscribirse a fakeTagReader cuando window.electronAPI no está disponible', () => {
      let receivedUid: string | null = null;
      let hookState: ReturnType<typeof useNfcReader> | null = null;

      function TestComponent() {
        hookState = useNfcReader((uid) => {
          receivedUid = uid;
        });
        return React.createElement('div', null, hookState.isListening ? 'Listening' : 'Idle');
      }

      renderToStaticMarkup(React.createElement(TestComponent));

      assert.ok(hookState, 'El hook useNfcReader debe retornar estado');
      assert.equal(typeof hookState.isListening, 'boolean');
      assert.equal(hookState.lastTagUid, null);

      // Simular evento de detección a través del reader
      fakeTagReader.emitTag('04A1B2C3D4E5F6');
      assert.equal(receivedUid, '04A1B2C3D4E5F6', 'Debe haber notificado al callback de tag');
    });

    it('debe suscribirse a window.electronAPI.onTagDetected cuando está disponible y desuscribirse limpiamente', () => {
      let unsubscribed = false;
      let registeredCallback: ((uid: string) => void) | null = null;

      const mockElectronApi = {
        onTagDetected: (cb: (uid: string) => void) => {
          registeredCallback = cb;
          return () => {
            unsubscribed = true;
          };
        },
      };

      // Inyectar electronAPI en el entorno global simulado
      const originalWindow = (globalThis as any).window;
      (globalThis as any).window = {
        ...(originalWindow || {}),
        electronAPI: mockElectronApi,
      };

      try {
        let detected = '';
        function TestComponent() {
          useNfcReader((uid) => {
            detected = uid;
          });
          return React.createElement('span', null, 'Active');
        }

        renderToStaticMarkup(React.createElement(TestComponent));

        assert.ok(registeredCallback, 'Debe haberse suscrito a window.electronAPI.onTagDetected');
        assert.equal(unsubscribed, false, 'No debe desuscribirse antes de desmontar');

        // Disparar evento a través del listener de Electron
        (registeredCallback as (uid: string) => void)('04E8A9B1C2D3E4');
        assert.equal(detected, '04E8A9B1C2D3E4', 'Debe procesar el tag recibido de Electron');
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });
  });

  describe('2. Flujo normal: formulario limpio (isDirty === false)', () => {
    it('cuando isDirty === false, el tag recibido se procesa directamente sin interrupción', () => {
      let resolvedUid: string | null = null;
      let guardState: ReturnType<typeof useFormDirtyGuard> | null = null;

      function TestComponent() {
        guardState = useFormDirtyGuard({
          initialDirty: false,
          onResolveTag: (uid) => {
            resolvedUid = uid;
          },
        });
        return React.createElement('div', null, 'CleanForm');
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      assert.ok(guardState);
      assert.equal(guardState.isDirty, false, 'isDirty debe iniciar en false');
      assert.equal(guardState.showUnsavedDialog, false);
      assert.equal(guardState.pendingUid, null);

      // Despachar escaneo de tag
      const processedDirectly = guardState.handleTagDetected('04A1B2C3D4E5F6');

      assert.equal(processedDirectly, true, 'Debe procesarse directamente');
      assert.equal(resolvedUid, '04A1B2C3D4E5F6', 'onResolveTag debe haber recibido el UID de inmediato');
      assert.equal(guardState.showUnsavedDialog, false, 'El diálogo no debe activarse');
      assert.equal(guardState.pendingUid, null, 'No debe haber UID pendiente');
    });
  });

  describe('3. Guardia concurrente ante cambios pendientes (RF-33)', () => {
    it('cuando isDirty === true al recibir un UID, la resolución se detiene de inmediato y activa el diálogo', () => {
      let resolvedUid: string | null = null;
      let guardState: ReturnType<typeof useFormDirtyGuard> | null = null;

      function TestComponent() {
        guardState = useFormDirtyGuard({
          initialDirty: true,
          onResolveTag: (uid) => {
            resolvedUid = uid;
          },
        });
        return React.createElement('div', null, 'DirtyForm');
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      assert.ok(guardState);
      assert.equal(guardState.isDirty, true, 'isDirty debe ser true');

      // Despachar escaneo de tag mientras el formulario está sucio
      const processedDirectly = guardState.handleTagDetected('04FFEEDDCCBBAA');

      assert.equal(processedDirectly, false, 'La resolución directa debe ser bloqueada (RF-33)');
      assert.equal(resolvedUid, null, 'onResolveTag NO debe ejecutarse de inmediato');
      assert.equal(guardState.showUnsavedDialog, true, 'showUnsavedDialog debe activarse');
      assert.equal(guardState.pendingUid, '04FFEEDDCCBBAA', 'pendingUid debe almacenar el UID escaneado');
    });

    it('acción Cancelar: cierra el diálogo, descarta el tag pendiente y preserva intacto el estado del formulario (RF-33)', () => {
      let resolvedUid: string | null = null;
      let guardState: ReturnType<typeof useFormDirtyGuard> | null = null;

      function TestComponent() {
        guardState = useFormDirtyGuard({
          initialDirty: true,
          onResolveTag: (uid) => {
            resolvedUid = uid;
          },
        });
        return React.createElement('div', null, 'DirtyForm');
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      assert.ok(guardState);

      // Simular escaneo concurrente
      guardState.handleTagDetected('04FFEEDDCCBBAA');
      assert.equal(guardState.showUnsavedDialog, true);
      assert.equal(guardState.pendingUid, '04FFEEDDCCBBAA');

      // El usuario cancela el descarte de cambios
      guardState.cancelDiscard();

      assert.equal(guardState.showUnsavedDialog, false, 'El diálogo debe cerrarse');
      assert.equal(guardState.pendingUid, null, 'El UID pendiente debe descartarse');
      assert.equal(guardState.isDirty, true, 'isDirty debe mantenerse intacto en true');
      assert.equal(resolvedUid, null, 'onResolveTag nunca debe haberse ejecutado');
    });

    it('acción Confirmar y Descartar: limpia isDirty, cierra diálogo y despacha la resolución del tag pendiente (RF-33)', () => {
      let resolvedUid: string | null = null;
      let guardState: ReturnType<typeof useFormDirtyGuard> | null = null;

      function TestComponent() {
        guardState = useFormDirtyGuard({
          initialDirty: true,
          onResolveTag: (uid) => {
            resolvedUid = uid;
          },
        });
        return React.createElement('div', null, 'DirtyForm');
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      assert.ok(guardState);

      // Simular escaneo concurrente
      guardState.handleTagDetected('04B1C2D3E4F5A6');
      assert.equal(guardState.showUnsavedDialog, true);
      assert.equal(guardState.pendingUid, '04B1C2D3E4F5A6');

      // El operador confirma descartar los cambios y resolver el tag
      guardState.confirmDiscard();

      assert.equal(guardState.showUnsavedDialog, false, 'El diálogo debe cerrarse');
      assert.equal(guardState.pendingUid, null, 'El UID pendiente debe limpiarse');
      assert.equal(guardState.isDirty, false, 'isDirty debe haberse reseteado a false');
      assert.equal(resolvedUid, '04B1C2D3E4F5A6', 'onResolveTag debe haber recibido el UID escaneado tras confirmar');
    });

    it('DirtyGuardProvider y useDirtyGuard permiten registrar isDirty desde componentes hijos', () => {
      let childGuardApi: ReturnType<typeof useDirtyGuard> | null = null;
      let resolvedUid: string | null = null;

      function ChildComponent() {
        childGuardApi = useDirtyGuard();
        return React.createElement('button', {
          onClick: () => childGuardApi?.setIsDirty(true),
        }, 'Mark Dirty');
      }

      function ParentComponent() {
        return React.createElement(
          DirtyGuardProvider,
          {
            onResolveTag: (uid: string) => {
              resolvedUid = uid;
            },
          },
          React.createElement(ChildComponent)
        );
      }

      renderToStaticMarkup(React.createElement(ParentComponent));

      assert.ok(childGuardApi, 'useDirtyGuard debe retornar la API del guard');
      assert.equal(childGuardApi.isDirty, false);

      // Simular que el formulario hijo registra cambios no guardados
      childGuardApi.setIsDirty(true);
      assert.equal(childGuardApi.isDirty, true, 'isDirty debe actualizarse a true');

      // Interceptar tag concurrente
      childGuardApi.handleTagDetected('04A1A2A3A4A5A6');
      assert.equal(childGuardApi.showUnsavedDialog, true);
      assert.equal(childGuardApi.pendingUid, '04A1A2A3A4A5A6');
      assert.equal(resolvedUid, null, 'No debe resolver de inmediato');

      // Confirmar descarte
      childGuardApi.confirmDiscard();
      assert.equal(childGuardApi.isDirty, false);
      assert.equal(resolvedUid, '04A1A2A3A4A5A6');
    });
  });

  describe('4. Componente UnsavedChangesDialog y Accesibilidad WAI-ARIA (RF-33, RNF-3)', () => {
    it('debe renderizar el diálogo de alerta cuando isOpen === true con semántica WAI-ARIA role="alertdialog"', () => {
      let confirmed = false;
      let cancelled = false;

      const html = renderToStaticMarkup(
        React.createElement(UnsavedChangesDialog, {
          isOpen: true,
          pendingUid: '04A1B2C3D4E5F6',
          onConfirm: () => {
            confirmed = true;
          },
          onCancel: () => {
            cancelled = true;
          },
        })
      );

      assert.ok(html.includes('role="alertdialog"'), 'Debe contar con role="alertdialog" para accesibilidad');
      assert.ok(html.includes('04A1B2C3D4E5F6'), 'Debe mostrar el UID del llavero escaneado');
      assert.ok(
        html.includes('cambios no guardados') || html.includes('Cambios no guardados'),
        'Debe alertar con claridad sobre cambios no guardados'
      );
      assert.ok(html.includes('Cancelar') || html.includes('Permanecer'), 'Debe contener acción de cancelar');
      assert.ok(html.includes('Confirmar') || html.includes('Descartar'), 'Debe contener acción de confirmar/descartar');
      assert.equal(confirmed, false);
      assert.equal(cancelled, false);
    });

    it('no debe renderizar el contenido modal cuando isOpen === false', () => {
      const html = renderToStaticMarkup(
        React.createElement(UnsavedChangesDialog, {
          isOpen: false,
          pendingUid: '04A1B2C3D4E5F6',
          onConfirm: () => {},
          onCancel: () => {},
        })
      );

      assert.equal(html.includes('role="alertdialog"'), false, 'No debe renderizar el diálogo cerrado');
      assert.equal(html.includes('04A1B2C3D4E5F6'), false);
    });
  });

  describe('5. Auditoría Estricta de RNF-3 (Cero Tailwind, Cero shadcn, Pure CSS Modules)', () => {
    const hooksDir = path.resolve(import.meta.dirname ?? '.', '../../src/hooks');
    const dialogsDir = path.resolve(import.meta.dirname ?? '.', '../../src/components/screens');

    it('los archivos de hooks y diálogo no deben importar Tailwind ni componentes prefabricados shadcn', () => {
      const filesToCheck = [
        path.join(hooksDir, 'use-nfc-reader.ts'),
        path.join(hooksDir, 'use-form-dirty-guard.ts'),
        path.join(dialogsDir, 'unsaved-changes-dialog.tsx'),
      ];

      for (const filePath of filesToCheck) {
        assert.ok(fs.existsSync(filePath), `Archivo requerido ${filePath} debe existir`);
        const content = fs.readFileSync(filePath, 'utf-8');

        assert.equal(
          content.includes('@tailwindcss') || content.includes('tailwindcss'),
          false,
          `El archivo ${path.basename(filePath)} no debe importar Tailwind CSS (RNF-3)`
        );

        assert.equal(
          content.includes('@/components/ui/') && content.includes('shadcn'),
          false,
          `El archivo ${path.basename(filePath)} no debe usar dependencias de shadcn (RNF-3)`
        );
      }
    });

    it('el módulo CSS de UnsavedChangesDialog debe usar exclusivamente CSS Modules y variables nativas', () => {
      const cssPath = path.join(dialogsDir, 'unsaved-changes-dialog.module.css');
      assert.ok(fs.existsSync(cssPath), `El archivo CSS ${cssPath} debe existir`);

      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.equal(
        cssContent.includes('@apply'),
        false,
        'No debe contener directivas @apply de Tailwind'
      );

      assert.ok(
        cssContent.includes('var(--'),
        'Debe consumir tokens del sistema de diseño mediante var(--color-*) o var(--space-*)'
      );
    });
  });
});
