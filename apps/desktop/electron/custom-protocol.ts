import * as fs from 'fs';
import * as path from 'path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'vetapp';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export const APP_SCHEME_PRIVILEGES = {
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/**
 * Procesa peticiones para el protocolo registrado app://vetapp/...
 * Garantiza resolución de archivos estáticos compilados y mitiga Directory Traversal.
 */
export async function handleAppRequest(
  requestUrl: string,
  distRoot: string,
): Promise<Response> {
  try {
    const parsed = new URL(requestUrl);
    const rawDecoded = decodeURIComponent(requestUrl);
    if (
      rawDecoded.includes('/../') ||
      rawDecoded.includes('\\..\\') ||
      rawDecoded.endsWith('/..') ||
      rawDecoded.endsWith('\\..') ||
      rawDecoded.includes('/..\\') ||
      rawDecoded.includes('\\../')
    ) {
      return new Response('Acceso denegado: intento de path traversal detectado', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    let pathname = decodeURIComponent(parsed.pathname);

    if (!pathname || pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const normalizedDistRoot = path.resolve(distRoot);
    const sanitizedRel = pathname.replace(/^\/+/, '');
    const targetPath = path.resolve(normalizedDistRoot, sanitizedRel);

    // Detección estricta de Directory Traversal (RNF-6)
    const relFromDist = path.relative(normalizedDistRoot, targetPath);
    if (relFromDist.startsWith('..') || path.isAbsolute(relFromDist)) {
      return new Response('Acceso denegado: intento de path traversal detectado', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (!fs.existsSync(targetPath)) {
      // Soporte para rutas SPA (si la ruta no tiene extensión, servir index.html)
      if (!path.extname(pathname)) {
        const indexPath = path.join(normalizedDistRoot, 'index.html');
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath);
          return new Response(content, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
      }
      return new Response('Recurso no encontrado', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(targetPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath);
        return new Response(content, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return new Response('Recurso no encontrado', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(targetPath);

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return new Response('Error interno sirviendo recurso de aplicación', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Registra el protocolo de esquema seguro app:// en Electron.
 */
export function registerAppProtocol(
  protocolInstance: { handle: (scheme: string, handler: (req: Request) => Promise<Response>) => void } | null,
  distRoot: string,
): void {
  if (!protocolInstance || typeof protocolInstance.handle !== 'function') {
    return;
  }

  protocolInstance.handle(APP_SCHEME, async (request: Request) => {
    return handleAppRequest(request.url, distRoot);
  });
}
