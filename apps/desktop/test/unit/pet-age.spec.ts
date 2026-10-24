import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPetAge } from '../../src/utils/pet-age.ts';

describe('formatPetAge (RF-17)', () => {
  it('retorna "Edad no registrada" cuando birthDate es undefined, null o vacío', () => {
    assert.equal(formatPetAge(undefined), 'Edad no registrada');
    assert.equal(formatPetAge(null), 'Edad no registrada');
    assert.equal(formatPetAge(''), 'Edad no registrada');
    assert.equal(formatPetAge('invalid-date'), 'Edad no registrada');
  });

  it('retorna "Edad no registrada" si la fecha es en el futuro', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const futureDate = new Date('2026-10-24T12:00:00Z');
    assert.equal(formatPetAge(futureDate, false, fixedNow), 'Edad no registrada');
  });

  it('calcula días cuando tiene menos de 1 mes', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const birth = new Date('2026-10-18T12:00:00Z');
    assert.equal(formatPetAge(birth, false, fixedNow), '5 días');
  });

  it('calcula meses cuando tiene menos de 1 año', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const birth = new Date('2026-06-23T12:00:00Z');
    assert.equal(formatPetAge(birth, false, fixedNow), '4 meses');
  });

  it('calcula años exactos', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const birth = new Date('2024-10-23T12:00:00Z');
    assert.equal(formatPetAge(birth, false, fixedNow), '2 años');
  });

  it('calcula años y meses combinados', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const birth = new Date('2024-05-20T12:00:00Z');
    assert.equal(formatPetAge(birth, false, fixedNow), '2 años, 5 meses');
  });

  it('agrega el sufijo (aprox.) cuando isApproximate es true', () => {
    const fixedNow = new Date('2026-10-23T12:00:00Z');
    const birth = new Date('2023-10-23T12:00:00Z');
    assert.equal(formatPetAge(birth, true, fixedNow), '3 años (aprox.)');
  });
});
