import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Role } from '@vet-app/shared-types';
import type { HardwareStatus } from '@vet-app/shared-types';

import {
  HardwareStatusIndicator,
  Header,
  Sidebar,
  MainLayout,
} from '../../src/components/layout/index.ts';

describe('Layout Principal y Conectividad de Hardware Serial (T30 / RF-34 / RNF-3)', () => {
  describe('1. Componente HardwareStatusIndicator (RF-34)', () => {
    it('debe renderizar estado Conectado con portName, role="status" y aria-live="polite"', () => {
      const status: HardwareStatus = {
        connected: true,
        portName: 'COM3',
        reconnecting: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, { status })
      );

      assert.ok(html.includes('role="status"'), 'Debe tener role="status" para accesibilidad WAI-ARIA');
      assert.ok(html.includes('aria-live="polite"'), 'Debe tener aria-live="polite"');
      assert.ok(html.includes('Conectado'), 'Debe mostrar texto "Conectado"');
      assert.ok(html.includes('COM3'), 'Debe incluir el nombre del puerto COM3');
      assert.ok(html.includes('connected'), 'Debe incluir clase o atributo de estado conectado');
    });

    it('debe renderizar estado Conectado con puerto SIMULATOR', () => {
      const status: HardwareStatus = {
        connected: true,
        portName: 'SIMULATOR',
        reconnecting: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, { status })
      );

      assert.ok(html.includes('Conectado'), 'Debe indicar Conectado');
      assert.ok(html.includes('SIMULATOR'), 'Debe reflejar SIMULATOR');
    });

    it('debe renderizar estado Desconectado mostrando "Hardware Desconectado"', () => {
      const status: HardwareStatus = {
        connected: false,
        reconnecting: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, { status })
      );

      assert.ok(html.includes('role="status"'), 'Debe tener role="status"');
      assert.ok(html.includes('aria-live="polite"'), 'Debe tener aria-live="polite"');
      assert.ok(
        html.includes('Hardware Desconectado') || html.includes('Desconectado'),
        'Debe indicar desconexión clara'
      );
      assert.ok(html.includes('disconnected'), 'Debe incluir clase o indicador de desconexión');
    });

    it('debe renderizar estado Reintentando con contador "X/10" conforme a RF-34', () => {
      const status: HardwareStatus = {
        connected: false,
        reconnecting: true,
        attemptCount: 3,
      };

      const html = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, { status })
      );

      assert.ok(html.includes('role="status"'), 'Debe tener role="status"');
      assert.ok(html.includes('aria-live="polite"'), 'Debe tener aria-live="polite"');
      assert.ok(html.includes('Reintentando'), 'Debe indicar que está reintentando');
      assert.ok(html.includes('3/10'), 'Debe reflejar el número de intento actual "3/10"');
      assert.ok(html.includes('reconnecting'), 'Debe incluir clase o indicador de reconexión');
    });

    it('debe limitar el contador de reintentos a 10 como máximo en estado Reintentando', () => {
      const status: HardwareStatus = {
        connected: false,
        reconnecting: true,
        attemptCount: 15,
      };

      const html = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, { status })
      );

      assert.ok(html.includes('10/10'), 'El contador de reintentos no debe superar 10/10');
    });

    it('debe proporcionar aria-label descriptivo en todos los estados', () => {
      const connectedHtml = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, {
          status: { connected: true, portName: 'COM1' },
        })
      );
      assert.ok(connectedHtml.includes('aria-label='), 'Debe tener aria-label al estar conectado');

      const disconnectedHtml = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, {
          status: { connected: false, reconnecting: false },
        })
      );
      assert.ok(disconnectedHtml.includes('aria-label='), 'Debe tener aria-label al estar desconectado');

      const reconnectingHtml = renderToStaticMarkup(
        React.createElement(HardwareStatusIndicator, {
          status: { connected: false, reconnecting: true, attemptCount: 2 },
        })
      );
      assert.ok(reconnectingHtml.includes('aria-label='), 'Debe tener aria-label al estar reintentando');
    });
  });

  describe('2. Componente Sidebar con Navegación Condicional RBAC', () => {
    it('debe desplegar ítems específicos para el rol RECEPTION', () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          role: Role.RECEPTION,
          activeScreen: 'pet-list',
          onSelectScreen: () => {},
        })
      );

      // Ítems obligatorios de RECEPTION
      assert.ok(html.includes('Lista de Pacientes'), 'RECEPTION debe ver Lista de Pacientes');
      assert.ok(html.includes('Registro de Mascota'), 'RECEPTION debe ver Registro de Mascota');
      assert.ok(!html.includes('Búsqueda/Asignación de Tag'), 'RECEPTION no debe ver Búsqueda/Asignación de Tag');
      assert.ok(html.includes('Agenda de Visitas'), 'RECEPTION debe ver Agenda de Visitas');

      // Restricción: No debe ver vistas clínicas avanzadas de VET ni gestión exclusiva de ADMIN
      assert.ok(!html.includes('Ficha Clínica'), 'RECEPTION no debe ver Ficha Clínica');
      assert.ok(!html.includes('Gestión de Clínica'), 'RECEPTION no debe ver Gestión de Clínica');
      assert.ok(!html.includes('Auditoría'), 'RECEPTION no debe ver Auditoría');
    });

    it('debe desplegar ítems específicos para el rol VET', () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          role: Role.VET,
          activeScreen: 'pet-list',
          onSelectScreen: () => {},
        })
      );

      // Ítems obligatorios de VET
      assert.ok(html.includes('Lista de Pacientes'), 'VET debe ver Lista de Pacientes');
      assert.ok(html.includes('Ficha Clínica'), 'VET debe ver Ficha Clínica');
      assert.ok(html.includes('Agenda de Consultas'), 'VET debe ver Agenda de Consultas');
      assert.ok(
        html.includes('Registro de Atención y Vacunación'),
        'VET debe ver Registro de Atención y Vacunación'
      );

      // Restricción: No debe ver vistas administrativas exclusivas de ADMIN
      assert.ok(!html.includes('Gestión de Clínica'), 'VET no debe ver Gestión de Clínica');
      assert.ok(!html.includes('Personal'), 'VET no debe ver Gestión de Personal');
      assert.ok(!html.includes('Auditoría'), 'VET no debe ver Auditoría');
    });

    it('debe desplegar ítems de acceso total para el rol ADMIN', () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          role: Role.ADMIN,
          activeScreen: 'pet-list',
          onSelectScreen: () => {},
        })
      );

      // Ítems obligatorios de ADMIN (Acceso total)
      assert.ok(html.includes('Gestión de Clínica'), 'ADMIN debe ver Gestión de Clínica');
      assert.ok(html.includes('Personal'), 'ADMIN debe ver Personal');
      assert.ok(html.includes('Pacientes') || html.includes('Lista de Pacientes'), 'ADMIN debe ver Pacientes');
      assert.ok(html.includes('Agenda'), 'ADMIN debe ver Agenda');
      assert.ok(html.includes('Auditoría'), 'ADMIN debe ver Auditoría');
    });

    it('debe asignar aria-current="page" únicamente al elemento de navegación activo', () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          role: Role.RECEPTION,
          activeScreen: 'pet-list',
          onSelectScreen: () => {},
        })
      );

      assert.ok(html.includes('aria-current="page"'), 'Debe marcar el ítem activo con aria-current="page"');

      // Comprobar que los botones tienen type="button" para accesibilidad con teclado
      const buttonMatches = html.match(/<button[^>]*type="button"[^>]*>/g) || [];
      assert.ok(buttonMatches.length >= 3, 'Los enlaces de navegación deben ser botones con type="button"');
    });
  });

  describe('3. Componente Header', () => {
    it('debe desplegar el nombre de la clínica activa', () => {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          clinicName: 'Clínica Veterinaria San Francisco',
          role: Role.VET,
        })
      );

      assert.ok(
        html.includes('Clínica Veterinaria San Francisco'),
        'Debe desplegar el nombre de la clínica activa'
      );
    });

    it('debe desplegar la insignia con el rol del usuario autenticado (ADMIN, VET, RECEPTION)', () => {
      for (const role of [Role.ADMIN, Role.VET, Role.RECEPTION]) {
        const html = renderToStaticMarkup(
          React.createElement(Header, {
            clinicName: 'VetCentral',
            role,
          })
        );
        assert.ok(html.includes(role), `Debe desplegar la insignia para el rol ${role}`);
      }
    });

    it('debe montar el HardwareStatusIndicator dentro del Header', () => {
      const status: HardwareStatus = {
        connected: true,
        portName: 'COM5',
      };

      const html = renderToStaticMarkup(
        React.createElement(Header, {
          clinicName: 'VetCentral',
          role: Role.ADMIN,
          hardwareStatus: status,
        })
      );

      assert.ok(html.includes('role="status"'), 'Debe incluir el HardwareStatusIndicator con role="status"');
      assert.ok(html.includes('COM5'), 'Debe reflejar el estado del hardware');
    });

    it('debe soportar acción de cierre de sesión con botón accesible', () => {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          clinicName: 'VetCentral',
          role: Role.VET,
          onLogout: () => {},
        })
      );

      assert.ok(
        html.includes('Cerrar sesión') || html.includes('Cerrar Sesión') || html.includes('aria-label="Cerrar sesión"'),
        'Debe incluir botón o disparador para cerrar sesión'
      );
    });
  });

  describe('4. Componente MainLayout', () => {
    it('debe integrar Header, Sidebar y área principal <main> estructurada', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          MainLayout,
          {
            role: Role.ADMIN,
            clinicName: 'Hospital Veterinario Norte',
            activeScreen: 'pet-list',
            onSelectScreen: () => {},
          },
          React.createElement('div', { id: 'test-content' }, 'Contenido del Panel')
        )
      );

      assert.ok(html.includes('<header') || html.includes('role="banner"'), 'Debe contener Header');
      assert.ok(html.includes('<aside') || html.includes('role="complementary"'), 'Debe contener Sidebar');
      assert.ok(html.includes('<main') || html.includes('role="main"'), 'Debe contener área principal <main>');
      assert.ok(html.includes('id="test-content"'), 'Debe renderizar los componentes hijos en <main>');
      assert.ok(html.includes('Contenido del Panel'), 'Debe proyectar el contenido hijo');
    });
  });

  describe('5. Auditoría Estricta de RNF-3 en Layout (Cero Tailwind, Cero shadcn)', () => {
    const layoutDir = path.resolve(import.meta.dirname ?? '.', '../../src/components/layout');

    it('los archivos del módulo layout no deben contener clases de utilidad Tailwind ni shadcn', () => {
      const files = fs.readdirSync(layoutDir);
      for (const file of files) {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts') && !file.endsWith('.css')) continue;

        const content = fs.readFileSync(path.join(layoutDir, file), 'utf-8');

        assert.ok(
          !content.includes('@tailwind'),
          `El archivo ${file} no debe incluir directivas @tailwind`
        );
        assert.ok(
          !content.includes('@apply'),
          `El archivo ${file} no debe incluir directivas @apply`
        );
        assert.ok(
          !content.includes('@/components/ui/'),
          `El archivo ${file} no debe importar componentes shadcn de rutas '@/components/ui/'`
        );
        assert.ok(
          !content.includes('className="flex ') && !content.includes("className='flex "),
          `El archivo ${file} no debe usar clases utilitarias de Tailwind`
        );
      }
    });

    it('los estilos deben utilizar exclusivamente CSS Modules y variables CSS nativas', () => {
      const cssFiles = fs.readdirSync(layoutDir).filter((f) => f.endsWith('.module.css'));
      assert.ok(cssFiles.length >= 3, 'Debe haber archivos .module.css para los componentes de layout');

      for (const file of cssFiles) {
        const content = fs.readFileSync(path.join(layoutDir, file), 'utf-8');
        assert.ok(
          content.includes('var(--'),
          `El archivo ${file} debe basar sus estilos en variables CSS nativas var(--...)`
        );
      }
    });
  });
});
