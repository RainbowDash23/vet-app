import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Componentes del Sistema de Diseño UI (RNF-3)
import {
  Button,
  Input,
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../src/components/ui/index.ts';

describe('Sistema de Diseño Base - Componentes UI y RNF-3 (T29)', () => {
  describe('1. Componente Button (button.tsx y button.module.css)', () => {
    it('debe renderizar con type="button" por defecto y clase base', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, null, 'Guardar Paciente'),
      );
      assert.ok(html.includes('type="button"'), 'Debe tener type="button" por defecto');
      assert.ok(html.includes('Guardar Paciente'), 'Debe contener el texto hijo');
    });

    it('debe permitir sobreescribir el atributo type a submit o reset', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, { type: 'submit' }, 'Enviar Formulario'),
      );
      assert.ok(html.includes('type="submit"'), 'Debe respetar type="submit"');
    });

    it('debe soportar variantes visuales: primary, secondary, destructive, outline, ghost', () => {
      const variants = ['primary', 'secondary', 'destructive', 'outline', 'ghost'] as const;
      for (const variant of variants) {
        const html = renderToStaticMarkup(
          React.createElement(Button, { variant }, `Botón ${variant}`),
        );
        assert.ok(
          html.includes(variant),
          `El HTML debe reflejar la clase de la variante ${variant}`,
        );
      }
    });

    it('debe soportar tamaños: sm, md, lg', () => {
      const sizes = ['sm', 'md', 'lg'] as const;
      for (const size of sizes) {
        const html = renderToStaticMarkup(
          React.createElement(Button, { size }, `Tamaño ${size}`),
        );
        assert.ok(html.includes(size), `El HTML debe reflejar la clase del tamaño ${size}`);
      }
    });

    it('debe manejar el estado disabled con atributos de accesibilidad', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, { disabled: true }, 'Inactivo'),
      );
      assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Debe tener atributo disabled');
      assert.ok(html.includes('aria-disabled="true"'), 'Debe incluir aria-disabled="true"');
    });

    it('debe manejar el estado isLoading reflejando aria-busy y deshabilitando la interacción', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, { isLoading: true }, 'Procesando...'),
      );
      assert.ok(html.includes('aria-busy="true"'), 'Debe incluir aria-busy="true" durante carga');
      assert.ok(html.includes('aria-disabled="true"'), 'Debe incluir aria-disabled="true" durante carga');
      assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Debe deshabilitar el botón durante carga');
      assert.ok(html.includes('spinner') || html.includes('loading'), 'Debe contener un indicador de carga');
    });

    it('debe soportar leftIcon y rightIcon', () => {
      const leftIcon = React.createElement('span', { 'data-testid': 'left-icon' }, '←');
      const rightIcon = React.createElement('span', { 'data-testid': 'right-icon' }, '→');
      const html = renderToStaticMarkup(
        React.createElement(Button, { leftIcon, rightIcon }, 'Con Iconos'),
      );
      assert.ok(html.includes('data-testid="left-icon"'), 'Debe renderizar leftIcon');
      assert.ok(html.includes('data-testid="right-icon"'), 'Debe renderizar rightIcon');
      assert.ok(html.includes('Con Iconos'), 'Debe renderizar children');
    });
  });

  describe('2. Componente Input (input.tsx y input.module.css)', () => {
    it('debe renderizar un input con label asociado via htmlFor y id', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'patient-name',
          label: 'Nombre del Paciente',
        }),
      );
      assert.ok(html.includes('for="patient-name"'), 'El label debe tener htmlFor vinculado al id');
      assert.ok(html.includes('id="patient-name"'), 'El input debe tener el id correcto');
      assert.ok(html.includes('Nombre del Paciente'), 'Debe renderizar el texto del label');
    });

    it('debe generar id automático si no se especifica explícitamente y vincular label', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Especie',
        }),
      );
      assert.ok(html.includes('for="'), 'El label debe tener atributo for');
      assert.ok(html.includes('id="'), 'El input debe tener atributo id');
      assert.ok(html.includes('Especie'), 'Debe renderizar el label');
    });

    it('debe renderizar mensaje de error con aria-invalid="true" y aria-describedby', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'nfc-uid',
          label: 'UID del Tag NFC',
          error: 'El UID debe tener entre 8 y 14 caracteres hexadecimales',
        }),
      );
      assert.ok(html.includes('aria-invalid="true"'), 'Debe incluir aria-invalid="true"');
      assert.ok(html.includes('aria-describedby="nfc-uid-error"'), 'aria-describedby debe apuntar al id del error');
      assert.ok(html.includes('id="nfc-uid-error"'), 'El contenedor del error debe tener id vinculado');
      assert.ok(html.includes('El UID debe tener entre 8 y 14 caracteres hexadecimales'), 'Debe mostrar el mensaje de error');
    });

    it('debe renderizar helperText con aria-describedby cuando no hay error', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'weight-field',
          label: 'Peso (kg)',
          helperText: 'Ingrese el peso en kilogramos con hasta 2 decimales',
        }),
      );
      assert.ok(html.includes('aria-invalid="false"'), 'aria-invalid debe ser "false" en ausencia de error');
      assert.ok(html.includes('aria-describedby="weight-field-helper"'), 'aria-describedby debe apuntar al helperText');
      assert.ok(html.includes('id="weight-field-helper"'), 'El contenedor helperText debe tener id vinculado');
      assert.ok(html.includes('Ingrese el peso en kilogramos con hasta 2 decimales'), 'Debe mostrar el texto de ayuda');
    });

    it('debe soportar required y disabled con atributos de accesibilidad', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          id: 'chip-id',
          label: 'Número de Microchip',
          required: true,
          disabled: true,
        }),
      );
      assert.ok(html.includes('required=""') || html.includes('required'), 'Debe contener atributo required');
      assert.ok(html.includes('aria-required="true"'), 'Debe incluir aria-required="true"');
      assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Debe contener atributo disabled');
    });
  });

  describe('3. Componentes Dialog y Primitivas Radix UI Accesibles (dialog.tsx)', () => {
    it('debe envolver primitivas de Radix UI con role="dialog" y estructura semántica', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          Dialog,
          { open: true },
          React.createElement(
            DialogContent,
            null,
            React.createElement(
              DialogHeader,
              null,
              React.createElement(DialogTitle, null, 'Nueva Consulta Veterinaria'),
              React.createElement(DialogDescription, null, 'Complete los datos clínicos de la visita.'),
            ),
            React.createElement(
              DialogFooter,
              null,
              React.createElement(DialogClose, null, 'Cancelar'),
            ),
          ),
        ),
      );

      assert.ok(html.includes('role="dialog"'), 'El diálogo de Radix debe tener role="dialog"');
      assert.ok(html.includes('Nueva Consulta Veterinaria'), 'Debe renderizar el título del diálogo');
      assert.ok(html.includes('Complete los datos clínicos de la visita.'), 'Debe renderizar la descripción');
      assert.ok(html.includes('Cancelar'), 'Debe renderizar el botón de cierre');
    });

    it('debe exportar todas las primitivas requeridas del diálogo', () => {
      assert.ok(Dialog, 'Dialog debe estar definido');
      assert.ok(DialogTrigger, 'DialogTrigger debe estar definido');
      assert.ok(DialogPortal, 'DialogPortal debe estar definido');
      assert.ok(DialogOverlay, 'DialogOverlay debe estar definido');
      assert.ok(DialogContent, 'DialogContent debe estar definido');
      assert.ok(DialogHeader, 'DialogHeader debe estar definido');
      assert.ok(DialogTitle, 'DialogTitle debe estar definido');
      assert.ok(DialogDescription, 'DialogDescription debe estar definido');
      assert.ok(DialogFooter, 'DialogFooter debe estar definido');
      assert.ok(DialogClose, 'DialogClose debe estar definido');
    });
  });

  describe('4. Componentes AlertDialog y Primitivas Radix UI Accesibles (alert-dialog.tsx)', () => {
    it('debe envolver primitivas de Radix UI con role="alertdialog" (RT-2, RF-33)', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AlertDialog,
          { open: true },
          React.createElement(
            AlertDialogContent,
            null,
            React.createElement(
              AlertDialogHeader,
              null,
              React.createElement(AlertDialogTitle, null, '¿Descartar cambios sin guardar?'),
              React.createElement(
                AlertDialogDescription,
                null,
                'Se detectó un nuevo tag NFC. Si continúa, perderá los datos ingresados en la consulta actual.',
              ),
            ),
            React.createElement(
              AlertDialogFooter,
              null,
              React.createElement(AlertDialogCancel, null, 'Permanecer aquí'),
              React.createElement(AlertDialogAction, null, 'Descartar y navegar'),
            ),
          ),
        ),
      );

      assert.ok(html.includes('role="alertdialog"'), 'El diálogo de alerta debe tener role="alertdialog"');
      assert.ok(html.includes('¿Descartar cambios sin guardar?'), 'Debe renderizar el título de alerta');
      assert.ok(html.includes('Se detectó un nuevo tag NFC'), 'Debe renderizar la advertencia descriptiva');
      assert.ok(html.includes('Permanecer aquí'), 'Debe renderizar el botón Cancel');
      assert.ok(html.includes('Descartar y navegar'), 'Debe renderizar el botón Action');
    });

    it('debe exportar todas las primitivas requeridas del alert dialog', () => {
      assert.ok(AlertDialog, 'AlertDialog debe estar definido');
      assert.ok(AlertDialogTrigger, 'AlertDialogTrigger debe estar definido');
      assert.ok(AlertDialogPortal, 'AlertDialogPortal debe estar definido');
      assert.ok(AlertDialogOverlay, 'AlertDialogOverlay debe estar definido');
      assert.ok(AlertDialogContent, 'AlertDialogContent debe estar definido');
      assert.ok(AlertDialogHeader, 'AlertDialogHeader debe estar definido');
      assert.ok(AlertDialogTitle, 'AlertDialogTitle debe estar definido');
      assert.ok(AlertDialogDescription, 'AlertDialogDescription debe estar definido');
      assert.ok(AlertDialogFooter, 'AlertDialogFooter debe estar definido');
      assert.ok(AlertDialogAction, 'AlertDialogAction debe estar definido');
      assert.ok(AlertDialogCancel, 'AlertDialogCancel debe estar definido');
    });
  });

  describe('5. Auditoría Estricta de RNF-3 (Cero Tailwind, Cero shadcn, Pure CSS Modules)', () => {
    it('package.json no debe contener dependencias de Tailwind CSS ni componentes preconfigurados shadcn', () => {
      const pkgPath = path.resolve(import.meta.dirname ?? '.', '../../package.json');
      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      const prohibitedDeps = [
        'tailwindcss',
        '@tailwindcss/vite',
        '@tailwindcss/postcss',
        'postcss',
        'autoprefixer',
        'tailwind-merge',
        'clsx',
      ];

      for (const dep of prohibitedDeps) {
        assert.strictEqual(
          dep in allDeps,
          false,
          `RNF-3 violado: Dependencia prohibida '${dep}' detectada en package.json`,
        );
      }
    });

    it('los archivos de estilos deben basarse en CSS Modules y variables CSS nativas sin utilidades Tailwind', () => {
      const stylesDir = path.resolve(import.meta.dirname ?? '.', '../../src/styles');
      const varCssPath = path.join(stylesDir, 'variables.css');
      const globalsCssPath = path.join(stylesDir, 'globals.css');

      assert.ok(fs.existsSync(varCssPath), 'variables.css debe existir');
      assert.ok(fs.existsSync(globalsCssPath), 'globals.css debe existir');

      const varCssContent = fs.readFileSync(varCssPath, 'utf-8');
      assert.ok(varCssContent.includes('--color-primary'), 'variables.css debe definir --color-primary');
      assert.ok(varCssContent.includes('--color-hw-connected'), 'variables.css debe definir estados de hardware: --color-hw-connected');
      assert.ok(varCssContent.includes('--color-hw-disconnected'), 'variables.css debe definir estados de hardware: --color-hw-disconnected');
      assert.ok(varCssContent.includes('--color-hw-reconnecting'), 'variables.css debe definir estados de hardware: --color-hw-reconnecting');

      const globalsCssContent = fs.readFileSync(globalsCssPath, 'utf-8');
      assert.ok(globalsCssContent.includes(':focus-visible'), 'globals.css debe definir foco accesible (:focus-visible)');
    });

    it('los módulos CSS de componentes no deben contener clases utilitarias de Tailwind (@apply o clases atómicas)', () => {
      const uiDir = path.resolve(import.meta.dirname ?? '.', '../../src/components/ui');
      const files = fs.readdirSync(uiDir, { recursive: true }) as string[];
      const cssFiles = files.filter(f => f.endsWith('.css'));

      for (const cssFile of cssFiles) {
        const fullPath = path.join(uiDir, cssFile);
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.strictEqual(
          content.includes('@apply'),
          false,
          `RNF-3 violado: Directiva @apply encontrada en ${cssFile}`,
        );
        assert.strictEqual(
          content.includes('@tailwind'),
          false,
          `RNF-3 violado: Directiva @tailwind encontrada en ${cssFile}`,
        );
      }
    });
  });
});
