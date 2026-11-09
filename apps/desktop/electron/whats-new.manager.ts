import * as fs from 'node:fs';
import * as path from 'node:path';
import type { App } from 'electron';
import type { WhatsNewStatus } from '@vet-app/shared-types';

export interface WhatsNewState {
  currentVersion?: string;
  lastSeenVersion: string | null;
  updatedAt?: string;
}

export interface WhatsNewManagerOptions {
  appInstance?: Pick<App, 'getVersion' | 'getPath'>;
  storageFilePath?: string;
  userDataPath?: string;
  storageDir?: string;
  currentVersion?: string;
}

/**
 * Gestor de estado de versiones y novedades (What's New) de la aplicación.
 * Persiste de forma segura en el proceso principal de Electron (userData)
 * sin exponer almacenamiento directo al Renderer (RNF-2, RNF-6).
 */
export class WhatsNewManager {
  private readonly storageFilePath: string;
  private readonly currentVersion: string;

  constructor(options: WhatsNewManagerOptions = {}) {
    this.currentVersion =
      options.currentVersion ??
      (options.appInstance?.getVersion ? options.appInstance.getVersion() : '0.1.1');

    if (options.storageFilePath) {
      this.storageFilePath = options.storageFilePath;
    } else {
      const basePath =
        options.storageDir ??
        options.userDataPath ??
        (options.appInstance?.getPath
          ? options.appInstance.getPath('userData')
          : process.cwd());
      this.storageFilePath = path.join(basePath, 'release-state.json');
    }
  }

  public getStorageFilePath(): string {
    return this.storageFilePath;
  }

  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Consulta si debe desplegarse la ventana de novedades.
   * Reglas:
   * - Instalación nueva (archivo de estado inexistente): se registra la versión actual y NO se muestra (showWhatsNew: false).
   * - Actualización (archivo existente con versión previa distinta): showWhatsNew: true.
   * - Ya vista en la versión actual: showWhatsNew: false.
   */
  public getStatus(): WhatsNewStatus {
    try {
      if (!fs.existsSync(this.storageFilePath)) {
        // Primera ejecución de una instalación nueva: registrar versión sin desplegar ventana
        this.saveState({
          currentVersion: this.currentVersion,
          lastSeenVersion: this.currentVersion,
        });
        return {
          showWhatsNew: false,
          currentVersion: this.currentVersion,
          lastSeenVersion: this.currentVersion,
        };
      }

      const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
      const data: WhatsNewState = JSON.parse(raw);
      const lastSeen = data.lastSeenVersion ?? null;

      if (!lastSeen) {
        this.saveState({
          currentVersion: this.currentVersion,
          lastSeenVersion: this.currentVersion,
        });
        return {
          showWhatsNew: false,
          currentVersion: this.currentVersion,
          lastSeenVersion: this.currentVersion,
        };
      }

      if (lastSeen !== this.currentVersion) {
        // Versión actualizada: corresponde mostrar novedades una única vez
        return {
          showWhatsNew: true,
          currentVersion: this.currentVersion,
          lastSeenVersion: lastSeen,
        };
      }

      return {
        showWhatsNew: false,
        currentVersion: this.currentVersion,
        lastSeenVersion: lastSeen,
      };
    } catch {
      // Fallback seguro ante archivos corruptos o bloqueados
      return {
        showWhatsNew: false,
        currentVersion: this.currentVersion,
        lastSeenVersion: null,
      };
    }
  }

  /**
   * Marca la versión indicada (o la versión actual) como visualizada.
   */
  public markSeen(versionToMark?: string): void {
    const version = versionToMark ?? this.currentVersion;
    this.saveState({
      currentVersion: this.currentVersion,
      lastSeenVersion: version,
    });
  }

  private saveState(state: WhatsNewState): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.storageFilePath,
        JSON.stringify(
          {
            currentVersion: state.currentVersion ?? this.currentVersion,
            lastSeenVersion: state.lastSeenVersion,
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      );
    } catch {
      // Manejo silencioso en entornos de solo lectura o pruebas
    }
  }
}
