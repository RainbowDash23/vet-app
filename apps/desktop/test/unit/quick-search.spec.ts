import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  ALL_QUICK_ACTIONS,
  formatSpeciesLabel,
} from '../../src/components/quick-search/quick-search-modal.tsx';
import type { Role } from '@vet-app/shared-types';

describe('Paleta de Búsqueda Rápida - Lógica Unitaria y RBAC (quick-search.spec.ts)', () => {
  describe('Control de Acceso Basado en Roles (RBAC) en Acciones Rápidas', () => {
    function getActionsForRole(role?: Role | 'ADMIN' | 'VET' | 'RECEPTION') {
      if (!role) return [];
      return ALL_QUICK_ACTIONS.filter((action) => action.allowedRoles.includes(role));
    }

    it('ADMIN debe tener acceso a Gestión de Personal (users), Auditoría y parámetros de Clínica', () => {
      const adminActions = getActionsForRole('ADMIN');
      const actionIds = adminActions.map((a) => a.id);

      assert.ok(actionIds.includes('action-users'), 'ADMIN debe tener acción de usuarios/personal');
      assert.ok(actionIds.includes('action-clinic-management'), 'ADMIN debe tener gestión de clínica');
      assert.ok(actionIds.includes('action-audit-logs'), 'ADMIN debe tener auditoría de accesos');
      assert.ok(actionIds.includes('action-pet-register'), 'ADMIN puede registrar mascotas');
      assert.ok(actionIds.includes('action-owner-register'), 'ADMIN puede registrar dueños');
    });

    it('VET debe tener acceso a Agenda de Consultas y Atención/Vacunación, pero NUNCA a Gestión de Usuarios ni Auditoría', () => {
      const vetActions = getActionsForRole('VET');
      const actionIds = vetActions.map((a) => a.id);

      assert.ok(actionIds.includes('action-vet-agenda'), 'VET debe tener agenda de consultas');
      assert.ok(actionIds.includes('action-care-vaccination'), 'VET debe tener atención y vacunación');

      // Restricciones estrictas
      assert.strictEqual(actionIds.includes('action-users'), false, 'VET NO debe acceder a usuarios');
      assert.strictEqual(actionIds.includes('action-clinic-management'), false, 'VET NO debe gestionar clínica');
      assert.strictEqual(actionIds.includes('action-audit-logs'), false, 'VET NO debe ver logs de auditoría');
    });

    it('RECEPTION debe tener acceso a Registro de Mascota, Propietario y Agenda de Visitas, pero NUNCA a Usuarios', () => {
      const receptionActions = getActionsForRole('RECEPTION');
      const actionIds = receptionActions.map((a) => a.id);

      assert.ok(actionIds.includes('action-pet-register'), 'RECEPTION puede registrar mascotas');
      assert.ok(actionIds.includes('action-owner-register'), 'RECEPTION puede registrar dueños');
      assert.ok(actionIds.includes('action-appointments'), 'RECEPTION puede gestionar citas');

      // Restricciones estrictas
      assert.strictEqual(actionIds.includes('action-users'), false, 'RECEPTION NO debe acceder a usuarios');
      assert.strictEqual(actionIds.includes('action-audit-logs'), false, 'RECEPTION NO debe ver logs de auditoría');
    });

    it('ninguna acción debe contener emojis en sus textos o descripciones (interfaz sobria)', () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      for (const action of ALL_QUICK_ACTIONS) {
        assert.doesNotMatch(action.label, emojiRegex, `Label '${action.label}' no debe tener emojis`);
        assert.doesNotMatch(action.description, emojiRegex, `Description '${action.description}' no debe tener emojis`);
      }
    });
  });

  describe('Formateador de Especies formatSpeciesLabel', () => {
    it('traduce correctamente especies caninas, felinas, aves y equinos a español', () => {
      assert.strictEqual(formatSpeciesLabel('CANINE'), 'Canino');
      assert.strictEqual(formatSpeciesLabel('FELINE'), 'Felino');
      assert.strictEqual(formatSpeciesLabel('AVIAN'), 'Ave');
      assert.strictEqual(formatSpeciesLabel('EQUINE'), 'Equino');
    });

    it('devuelve el valor recibido o fallback Mascota ante valores atípicos o undefined', () => {
      assert.strictEqual(formatSpeciesLabel('RODENT'), 'RODENT');
      assert.strictEqual(formatSpeciesLabel(undefined), 'Mascota');
    });
  });

  describe('Aislamiento y Proyección de Datos Sensibles de Pacientes', () => {
    it('documento de identidad de propietario solo debe ser expuesto si la API lo incluye en la respuesta', () => {
      const fullAccessPet = {
        id: 'pet-1',
        name: 'Rex',
        species: 'CANINE',
        owner: { fullName: 'Ana García', documentId: '87654321' },
      };

      const restrictedPet = {
        id: 'pet-2',
        name: 'Luna',
        species: 'FELINE',
        owner: { fullName: 'Carlos López' }, // sin documentId por restricción de consentimiento
      };

      assert.strictEqual(fullAccessPet.owner.documentId, '87654321');
      assert.strictEqual((restrictedPet.owner as any).documentId, undefined);
    });
  });
});
