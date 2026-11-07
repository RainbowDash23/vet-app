/**
 * Utilidades para resolución de URLs de rescate y contingencia médica.
 *
 * Reglas:
 * 1. Deriva de VITE_PUBLIC_URL si está definida.
 * 2. Si no, deriva de VITE_API_URL (agregando /p).
 * 3. En la aplicación empaquetada o entorno de producción, NUNCA debe resolver a localhost.
 * 4. En desarrollo local sin variables, retorna el fallback http://localhost:3000/p.
 */

export interface EmergencyUrlEnv {
  publicUrl?: string | null;
  apiUrl?: string | null;
  isProduction?: boolean;
}

export function resolveEmergencyPublicBaseUrl(env?: EmergencyUrlEnv): string | null {
  const publicUrl = env?.publicUrl?.trim();
  if (publicUrl) {
    const clean = publicUrl.replace(/\/+$/, '');
    return clean.endsWith('/p') ? clean : `${clean}/p`;
  }

  const apiUrl = env?.apiUrl?.trim();
  if (apiUrl) {
    const clean = apiUrl.replace(/\/+$/, '');
    return clean.endsWith('/p') ? clean : `${clean}/p`;
  }

  // En la aplicación empaquetada o producción, nunca devolver localhost
  if (env?.isProduction) {
    return null;
  }

  // En desarrollo local
  return 'http://localhost:3000/p';
}

export function resolveEmergencyUrl(
  publicCode: string | null | undefined,
  env?: EmergencyUrlEnv,
): string | null {
  if (!publicCode) {
    return null;
  }

  const isProduction =
    env?.isProduction ??
    (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD)) ??
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production');

  const publicUrl =
    env?.publicUrl ??
    (typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PUBLIC_URL as string | undefined) ||
        (import.meta.env?.PUBLIC_BASE_URL as string | undefined)
      : undefined) ??
    (typeof process !== 'undefined'
      ? process.env?.VITE_PUBLIC_URL || process.env?.PUBLIC_BASE_URL
      : undefined);

  const apiUrl =
    env?.apiUrl ??
    (typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_API_URL as string | undefined)
      : undefined) ??
    (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined);

  const baseUrl = resolveEmergencyPublicBaseUrl({
    publicUrl,
    apiUrl,
    isProduction,
  });

  return baseUrl ? `${baseUrl}/${publicCode}` : null;
}
