import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  APP_ORIGIN,
  APP_SCHEME,
  APP_SCHEME_PRIVILEGES,
  handleAppRequest,
  registerAppProtocol,
} from '../../electron/custom-protocol.ts';

describe('Protocolo Personalizado Seguro (custom-protocol.ts / app://vetapp)', () => {
  let tempDist: string;

  before(() => {
    tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'vet-app-protocol-test-'));
    fs.writeFileSync(
      path.join(tempDist, 'index.html'),
      '<!DOCTYPE html><html><head><title>VetApp</title></head><body><h1>VetApp Root</h1></body></html>',
    );
    fs.mkdirSync(path.join(tempDist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(tempDist, 'assets', 'style.css'), 'body { background: #0c0e12; }');
    fs.writeFileSync(path.join(tempDist, 'assets', 'app.js'), 'console.log("VetApp bundle");');
    fs.writeFileSync(path.join(tempDist, 'assets', 'logo.svg'), '<svg></svg>');
  });

  after(() => {
    if (tempDist && fs.existsSync(tempDist)) {
      fs.rmSync(tempDist, { recursive: true, force: true });
    }
  });

  it('debe definir las constantes y privilegios del esquema seguro app://', () => {
    assert.strictEqual(APP_SCHEME, 'app');
    assert.strictEqual(APP_ORIGIN, 'app://vetapp');
    assert.deepStrictEqual(APP_SCHEME_PRIVILEGES, {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    });
  });

  it('debe servir index.html cuando la URL es la raíz app://vetapp/', async () => {
    const res = await handleAppRequest('app://vetapp/', tempDist);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('Content-Type')?.includes('text/html'));
    const body = await res.text();
    assert.ok(body.includes('VetApp Root'));
  });

  it('debe servir index.html explícito en app://vetapp/index.html', async () => {
    const res = await handleAppRequest('app://vetapp/index.html', tempDist);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('Content-Type')?.includes('text/html'));
  });

  it('debe servir archivos estáticos con su Content-Type correcto', async () => {
    const cssRes = await handleAppRequest('app://vetapp/assets/style.css', tempDist);
    assert.strictEqual(cssRes.status, 200);
    assert.ok(cssRes.headers.get('Content-Type')?.includes('text/css'));

    const jsRes = await handleAppRequest('app://vetapp/assets/app.js', tempDist);
    assert.strictEqual(jsRes.status, 200);
    assert.ok(jsRes.headers.get('Content-Type')?.includes('application/javascript'));

    const svgRes = await handleAppRequest('app://vetapp/assets/logo.svg', tempDist);
    assert.strictEqual(svgRes.status, 200);
    assert.ok(svgRes.headers.get('Content-Type')?.includes('image/svg+xml'));
  });

  it('debe bloquear con HTTP 403 intentos de Directory Traversal (../)', async () => {
    const traversal1 = await handleAppRequest('app://vetapp/../package.json', tempDist);
    assert.strictEqual(traversal1.status, 403);
    const body1 = await traversal1.text();
    assert.ok(body1.includes('path traversal'));

    const traversal2 = await handleAppRequest('app://vetapp/assets/../../etc/passwd', tempDist);
    assert.strictEqual(traversal2.status, 403);

    const traversalEncoded = await handleAppRequest('app://vetapp/%2e%2e%2fpackage.json', tempDist);
    assert.strictEqual(traversalEncoded.status, 403);
  });

  it('debe responder HTTP 404 ante archivo con extensión inexistente', async () => {
    const res = await handleAppRequest('app://vetapp/assets/missing.png', tempDist);
    assert.strictEqual(res.status, 404);
  });

  it('debe hacer fallback a index.html en rutas SPA sin extensión', async () => {
    const res = await handleAppRequest('app://vetapp/pacientes', tempDist);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('Content-Type')?.includes('text/html'));
    const body = await res.text();
    assert.ok(body.includes('VetApp Root'));
  });

  it('registerAppProtocol debe registrar el manejador de esquema en el protocolo de Electron', () => {
    let registeredScheme: string | null = null;
    let registeredHandler: Function | null = null;

    const mockProtocol = {
      handle: (scheme: string, handler: (req: Request) => Promise<Response>) => {
        registeredScheme = scheme;
        registeredHandler = handler;
      },
    };

    registerAppProtocol(mockProtocol as any, tempDist);
    assert.strictEqual(registeredScheme, 'app');
    assert.ok(registeredHandler !== null);
  });
});
