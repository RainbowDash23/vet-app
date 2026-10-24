import * as fs from 'fs';
import * as path from 'path';
import electron from 'electron';

export interface SerialConfigData {
  lastUsedPort: string | null;
}

const electronModule =
  (electron as unknown as { default?: typeof import('electron') })?.default ??
  (electron as unknown as typeof import('electron'));

let inMemoryConfig: SerialConfigData = {
  lastUsedPort: null,
};

function getConfigFilePath(): string | null {
  try {
    const app = electronModule?.app;
    if (app && typeof app.getPath === 'function') {
      const userDataDir = app.getPath('userData');
      if (userDataDir) {
        return path.join(userDataDir, 'serial-config.json');
      }
    }
  } catch {
    // Entorno de test o sin acceso a Electron runtime
  }
  return null;
}

/**
 * Carga de forma segura la preferencia del último puerto usado en el proceso principal.
 * Nunca persiste credenciales, tokens ni datos clínicos (RNF-2).
 */
export function getLastUsedPort(): string | null {
  const filePath = getConfigFilePath();
  if (!filePath) {
    return inMemoryConfig.lastUsedPort;
  }

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SerialConfigData>;
      if (typeof parsed?.lastUsedPort === 'string' && parsed.lastUsedPort.trim() !== '') {
        return parsed.lastUsedPort.trim();
      }
    }
  } catch {
    // Si el archivo está corrupto o no se puede leer, devuelve fallback
  }

  return inMemoryConfig.lastUsedPort;
}

/**
 * Guarda la preferencia del último puerto usado en el proceso principal.
 * Solo almacena el identificador del puerto (ej: "COM4").
 */
export function setLastUsedPort(portName: string | null): void {
  inMemoryConfig.lastUsedPort = portName ? portName.trim() : null;

  const filePath = getConfigFilePath();
  if (!filePath) {
    return;
  }

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: SerialConfigData = {
      lastUsedPort: inMemoryConfig.lastUsedPort,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Si falla la escritura en disco, se mantiene en memoria sin arrojar excepción
  }
}

/**
 * Limpia la configuración (útil para pruebas unitarias).
 */
export function resetSerialConfigForTesting(): void {
  inMemoryConfig = { lastUsedPort: null };
}
