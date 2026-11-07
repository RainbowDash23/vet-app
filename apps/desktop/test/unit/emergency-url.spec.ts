import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  resolveEmergencyPublicBaseUrl,
  resolveEmergencyUrl,
} from '../../src/utils/emergency-url.ts';

describe('Resolución de Enlace de Emergencia en Ficha Médica (SPEC EARS)', () => {
  const samplePublicCode = '44651d1b-d12e-4894-9252-0f0208bf2353';

  it('debe retornar null si no se proporciona publicCode', () => {
    assert.strictEqual(resolveEmergencyUrl(null), null);
    assert.strictEqual(resolveEmergencyUrl(undefined), null);
    assert.strictEqual(resolveEmergencyUrl(''), null);
  });

  it('debe derivar de VITE_PUBLIC_URL cuando está definida', () => {
    const url = resolveEmergencyUrl(samplePublicCode, {
      publicUrl: 'https://emergencia.vetapp.com',
      isProduction: true,
    });
    assert.strictEqual(
      url,
      `https://emergencia.vetapp.com/p/${samplePublicCode}`,
    );
  });

  it('no debe duplicar /p si VITE_PUBLIC_URL ya incluye el prefijo /p', () => {
    const url = resolveEmergencyUrl(samplePublicCode, {
      publicUrl: 'https://emergencia.vetapp.com/p///',
      isProduction: true,
    });
    assert.strictEqual(
      url,
      `https://emergencia.vetapp.com/p/${samplePublicCode}`,
    );
  });

  it('debe derivar de VITE_API_URL (agregando /p) cuando no se defina VITE_PUBLIC_URL', () => {
    const url = resolveEmergencyUrl(samplePublicCode, {
      apiUrl: 'https://TU-SERVICIO.onrender.com',
      isProduction: true,
    });
    assert.strictEqual(
      url,
      `https://TU-SERVICIO.onrender.com/p/${samplePublicCode}`,
    );
  });

  it('debe normalizar barras diagonales en VITE_API_URL', () => {
    const url = resolveEmergencyUrl(samplePublicCode, {
      apiUrl: 'https://TU-SERVICIO.onrender.com///',
      isProduction: true,
    });
    assert.strictEqual(
      url,
      `https://TU-SERVICIO.onrender.com/p/${samplePublicCode}`,
    );
  });

  it('VITE_PUBLIC_URL debe tener prioridad sobre VITE_API_URL si ambas están presentes', () => {
    const url = resolveEmergencyUrl(samplePublicCode, {
      publicUrl: 'https://portal.vetapp.com/p',
      apiUrl: 'https://api.vetapp.com',
      isProduction: true,
    });
    assert.strictEqual(
      url,
      `https://portal.vetapp.com/p/${samplePublicCode}`,
    );
  });

  it('NUNCA debe resolver a localhost en la app empaquetada / producción cuando falten variables', () => {
    const base = resolveEmergencyPublicBaseUrl({
      isProduction: true,
    });
    assert.strictEqual(base, null);

    const url = resolveEmergencyUrl(samplePublicCode, {
      isProduction: true,
    });
    assert.strictEqual(url, null);
    assert.ok(url === null || (!url.includes('localhost') && !url.includes('127.0.0.1')));
  });

  it('en desarrollo local sin variables debe resolver al fallback http://localhost:3000/p', () => {
    const base = resolveEmergencyPublicBaseUrl({
      isProduction: false,
    });
    assert.strictEqual(base, 'http://localhost:3000/p');

    const url = resolveEmergencyUrl(samplePublicCode, {
      isProduction: false,
    });
    assert.strictEqual(url, `http://localhost:3000/p/${samplePublicCode}`);
  });
});
