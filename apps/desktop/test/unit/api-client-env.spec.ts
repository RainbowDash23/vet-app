import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ApiClient } from '../../src/services/api.client.ts';

describe('Inyección de URL de API en Tiempo de Build (VITE_API_URL)', () => {
  it('debe utilizar la URL por defecto local http://localhost:3000 cuando no se proveen opciones ni variables', () => {
    const client = new ApiClient();
    assert.strictEqual(client.getBaseUrl(), 'http://localhost:3000');
  });

  it('debe priorizar baseUrl explícita si se proporciona en las opciones', () => {
    const client = new ApiClient({ baseUrl: 'https://api.veterinaria-central.com' });
    assert.strictEqual(client.getBaseUrl(), 'https://api.veterinaria-central.com');
  });

  it('debe normalizar barras diagonales finales de la URL base', () => {
    const client = new ApiClient({ baseUrl: 'https://api.veterinaria-central.com///' });
    assert.strictEqual(client.getBaseUrl(), 'https://api.veterinaria-central.com');
  });

  it('debe resolver la variable de entorno VITE_API_URL en proceso si está definida', () => {
    const original = process.env.VITE_API_URL;
    try {
      process.env.VITE_API_URL = 'https://vet-app-api.onrender.com';
      const client = new ApiClient();
      assert.strictEqual(client.getBaseUrl(), 'https://vet-app-api.onrender.com');
    } finally {
      if (original !== undefined) {
        process.env.VITE_API_URL = original;
      } else {
        delete process.env.VITE_API_URL;
      }
    }
  });
});
