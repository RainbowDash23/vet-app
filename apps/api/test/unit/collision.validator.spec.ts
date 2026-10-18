import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { CollisionValidator } from '../../src/modules/visits/collision.validator';

describe('CollisionValidator (T18 / RF-40)', () => {
  const validator = new CollisionValidator();

  // Fecha base para pruebas: 2026-10-20 10:00:00 UTC
  const baseTime = new Date('2026-10-20T10:00:00.000Z');
  // Turno existente: 10:00 a 10:30 (30 minutos)
  const existingVisit30Min = {
    scheduledDate: baseTime,
    durationMinutes: 30,
  };

  it('Caso 1: Turno que termina exactamente cuando inicia otro (permitido, sin colisión)', () => {
    // Existente: 10:00 a 10:30
    // Nuevo: 09:30 a 10:00 (termina exactamente a las 10:00)
    const newStart = new Date('2026-10-20T09:30:00.000Z');
    const newDuration = 30;

    const hasCollisionInstance = validator.hasCollision(newStart, newDuration, [existingVisit30Min]);
    const hasCollisionStatic = CollisionValidator.hasCollision(newStart, newDuration, [existingVisit30Min]);

    assert.strictEqual(hasCollisionInstance, false, 'No debe colisionar cuando el nuevo turno finaliza justo al iniciar el existente');
    assert.strictEqual(hasCollisionStatic, false, 'Método estático debe comportarse igual');
  });

  it('Caso 2: Turno que inicia exactamente cuando finaliza otro (permitido, sin colisión)', () => {
    // Existente: 10:00 a 10:30
    // Nuevo: 10:30 a 11:00 (inicia exactamente a las 10:30)
    const newStart = new Date('2026-10-20T10:30:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, [existingVisit30Min]);
    assert.strictEqual(hasCollision, false, 'No debe colisionar cuando el nuevo turno inicia justo al finalizar el existente');
  });

  it('Caso 3: Turno completamente contenido en otro (colisión detectada)', () => {
    // Existente: 10:00 a 11:00 (60 minutos)
    // Nuevo: 10:15 a 10:45 (30 minutos, dentro de 10:00 - 11:00)
    const existingVisit60Min = {
      scheduledDate: new Date('2026-10-20T10:00:00.000Z'),
      durationMinutes: 60,
    };
    const newStart = new Date('2026-10-20T10:15:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, [existingVisit60Min]);
    assert.strictEqual(hasCollision, true, 'Debe detectar colisión cuando el nuevo turno está totalmente dentro del existente');
  });

  it('Caso 4: Turno que engloba a otro (colisión detectada)', () => {
    // Existente: 10:15 a 10:45 (30 minutos)
    // Nuevo: 10:00 a 11:00 (60 minutos, contiene al existente)
    const existingVisit = {
      scheduledDate: new Date('2026-10-20T10:15:00.000Z'),
      durationMinutes: 30,
    };
    const newStart = new Date('2026-10-20T10:00:00.000Z');
    const newDuration = 60;

    const hasCollision = validator.hasCollision(newStart, newDuration, [existingVisit]);
    assert.strictEqual(hasCollision, true, 'Debe detectar colisión cuando el nuevo turno engloba al turno existente');
  });

  it('Caso 5: Turno que inicia antes y termina durante otro (colisión detectada)', () => {
    // Existente: 10:00 a 10:30
    // Nuevo: 09:45 a 10:15 (inicia antes de las 10:00 y termina a las 10:15)
    const newStart = new Date('2026-10-20T09:45:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, [existingVisit30Min]);
    assert.strictEqual(hasCollision, true, 'Debe detectar colisión cuando el nuevo turno solapa el inicio del existente');
  });

  it('Caso 6: Turno que inicia durante y termina después de otro (colisión detectada)', () => {
    // Existente: 10:00 a 10:30
    // Nuevo: 10:15 a 10:45 (inicia a las 10:15 y termina después de las 10:30)
    const newStart = new Date('2026-10-20T10:15:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, [existingVisit30Min]);
    assert.strictEqual(hasCollision, true, 'Debe detectar colisión cuando el nuevo turno solapa el final del existente');
  });

  it('Caso complementario: Lista vacía de visitas existentes no debe colisionar', () => {
    const newStart = new Date('2026-10-20T10:00:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, []);
    assert.strictEqual(hasCollision, false, 'No debe colisionar si no hay visitas previas');
  });

  it('Caso complementario: Debe detectar colisión si cualquiera de múltiples visitas existentes solapa', () => {
    const existingVisits = [
      { scheduledDate: new Date('2026-10-20T08:00:00.000Z'), durationMinutes: 30 }, // 08:00 - 08:30
      { scheduledDate: new Date('2026-10-20T11:00:00.000Z'), durationMinutes: 45 }, // 11:00 - 11:45
      { scheduledDate: new Date('2026-10-20T14:00:00.000Z'), durationMinutes: 30 }, // 14:00 - 14:30
    ];

    // Nuevo: 11:30 a 12:00 -> solapa con la segunda visita (11:00 - 11:45)
    const newStart = new Date('2026-10-20T11:30:00.000Z');
    const newDuration = 30;

    const hasCollision = validator.hasCollision(newStart, newDuration, existingVisits);
    assert.strictEqual(hasCollision, true, 'Debe colisionar con la visita de las 11:00 - 11:45');
  });
});
