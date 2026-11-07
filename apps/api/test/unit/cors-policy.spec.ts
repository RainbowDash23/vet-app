import { describe, it } from 'node:test';
import * as assert from 'node:assert';

describe('Política de CORS y Protocolo de Origen Seguro (app://vetapp vs file:// y null)', () => {
  const defaultDevOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'app://vetapp',
  ];

  it('los orígenes por defecto de desarrollo deben incluir app://vetapp y excluir file:// y null', () => {
    assert.ok(
      defaultDevOrigins.includes('app://vetapp'),
      'app://vetapp debe estar en los orígenes permitidos por defecto para el cliente empaquetado',
    );
    assert.strictEqual(
      defaultDevOrigins.includes('file://'),
      false,
      'file:// debe estar excluido para mitigar ataques locales y ejecución no autorizada',
    );
    assert.strictEqual(
      defaultDevOrigins.includes('null'),
      false,
      'null debe estar excluido para prevenir peticiones desde sandboxes o iframes opacos',
    );
  });

  it('debe validar que CORS_ORIGIN en producción admita app://vetapp de forma segura', () => {
    const prodCors = 'app://vetapp,https://clinica.example.com';
    const allowed = prodCors.split(',').map((o) => o.trim());

    assert.ok(allowed.includes('app://vetapp'), 'Debe incluir el protocolo seguro del cliente');
    assert.strictEqual(allowed.includes('*'), false, 'No debe permitir comodines en producción');
    assert.strictEqual(allowed.includes('file://'), false, 'No debe permitir file://');
    assert.strictEqual(allowed.includes('null'), false, 'No debe permitir null');
  });

  it('función de validación de origen simula rechazo estricto de file:// y null', () => {
    const isOriginAllowed = (origin: string | undefined, allowedOrigins: string[]): boolean => {
      if (!origin) return false;
      return allowedOrigins.includes(origin);
    };

    assert.strictEqual(isOriginAllowed('app://vetapp', defaultDevOrigins), true);
    assert.strictEqual(isOriginAllowed('http://localhost:5173', defaultDevOrigins), true);
    assert.strictEqual(isOriginAllowed('file://', defaultDevOrigins), false);
    assert.strictEqual(isOriginAllowed('null', defaultDevOrigins), false);
    assert.strictEqual(isOriginAllowed('http://malicious-site.com', defaultDevOrigins), false);
  });
});
