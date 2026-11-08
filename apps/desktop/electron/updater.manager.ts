import type { UpdateState, UpdateStatusPayload } from '@vet-app/shared-types';

export interface IAutoUpdater {
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
}

export interface UpdaterManagerOptions {
  updater?: IAutoUpdater;
  isPackaged?: boolean;
  timeoutMs?: number;
  currentVersion?: string;
  logger?: { info: (...args: any[]) => void; error: (...args: any[]) => void; warn: (...args: any[]) => void };
}

/**
 * Gestor de actualizaciones automáticas seguras mediante electron-updater.
 * - Desactivado en desarrollo.
 * - Sin prereleases ni downgrades.
 * - Timeout de 10 segundos ante fallos de red o lentitud para garantizar apertura de la app.
 * - Eventos IPC tipados hacia el splash screen / renderer.
 */
export class UpdaterManager {
  private readonly updater: IAutoUpdater | null;
  private readonly isPackaged: boolean;
  private readonly timeoutMs: number;
  private readonly currentVersion: string;
  private readonly logger: { info: (...args: any[]) => void; error: (...args: any[]) => void; warn: (...args: any[]) => void };

  private currentState: UpdateState = 'idle';
  private currentPercent = 0;
  private availableVersion: string | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private onReadyCallback: (() => void) | null = null;
  private onStatusChangeCallback: ((payload: UpdateStatusPayload) => void) | null = null;
  private readyInvoked = false;

  constructor(options: UpdaterManagerOptions = {}) {
    this.isPackaged = options.isPackaged ?? false;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.currentVersion = options.currentVersion ?? '0.1.0';
    this.logger = options.logger ?? console;
    this.updater = options.updater ?? null;
  }

  public getState(): UpdateState {
    return this.currentState;
  }

  public getStatusPayload(): UpdateStatusPayload {
    return {
      state: this.currentState,
      percent: this.currentPercent,
      version: this.availableVersion ?? undefined,
      currentVersion: this.currentVersion,
    };
  }

  private emitStatus(state: UpdateState, percent = 0, version?: string, error?: string): void {
    this.currentState = state;
    this.currentPercent = percent;
    if (version) this.availableVersion = version;

    const payload: UpdateStatusPayload = {
      state,
      percent,
      version: this.availableVersion ?? undefined,
      currentVersion: this.currentVersion,
      error,
    };

    if (this.onStatusChangeCallback) {
      try {
        this.onStatusChangeCallback(payload);
      } catch (err) {
        this.logger.error('[UpdaterManager] Error en callback de estado:', err);
      }
    }
  }

  private triggerReady(): void {
    if (this.readyInvoked) return;
    this.readyInvoked = true;
    this.clearTimeoutTimer();

    if (this.onReadyCallback) {
      try {
        this.onReadyCallback();
      } catch (err) {
        this.logger.error('[UpdaterManager] Error en callback onReady:', err);
      }
    }
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Inicia el proceso de verificación de actualizaciones.
   */
  public start(
    onReady: () => void,
    onStatusChange?: (payload: UpdateStatusPayload) => void,
  ): void {
    this.onReadyCallback = onReady;
    this.onStatusChangeCallback = onStatusChange ?? null;
    this.readyInvoked = false;

    // En desarrollo, omitir comprobación y continuar de inmediato
    if (!this.isPackaged || !this.updater) {
      this.logger.info('[UpdaterManager] Actualizaciones omitidas (modo desarrollo o updater no disponible)');
      this.emitStatus('idle');
      this.triggerReady();
      return;
    }

    // Configuración estricta de actualización segura (sin degradaciones ni pre-versiones)
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;
    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = false;

    // Timeout de seguridad: si no hay respuesta en 10s, abrir la aplicación normal
    this.timeoutTimer = setTimeout(() => {
      this.logger.warn(`[UpdaterManager] Timeout de ${this.timeoutMs}ms superado buscando actualizaciones. Continuando...`);
      this.emitStatus('not-available');
      this.triggerReady();
    }, this.timeoutMs);

    this.setupListeners();

    this.emitStatus('checking');
    this.updater.checkForUpdates().catch((err: unknown) => {
      this.logger.error('[UpdaterManager] Error al invocar checkForUpdates:', err);
      this.emitStatus('error', 0, undefined, err instanceof Error ? err.message : String(err));
      this.triggerReady();
    });
  }

  private setupListeners(): void {
    if (!this.updater) return;

    this.updater.on('checking-for-update', () => {
      this.emitStatus('checking');
    });

    this.updater.on('update-available', (info: { version?: string }) => {
      // Se encontró versión nueva; se cancela el timeout de búsqueda porque comienza la descarga activa
      this.clearTimeoutTimer();
      const newVersion = info?.version || 'nueva versión';
      this.availableVersion = newVersion;
      this.emitStatus('available', 0, newVersion);
    });

    this.updater.on('download-progress', (progressObj: { percent?: number }) => {
      const pct = Math.round(progressObj?.percent ?? 0);
      this.emitStatus('downloading', pct);
    });

    this.updater.on('update-downloaded', (info: { version?: string }) => {
      const version = info?.version || this.availableVersion || undefined;
      this.emitStatus('downloaded', 100, version);
      // Queda a la espera de que el usuario confirme reiniciar o se invoque restartAndInstall
    });

    this.updater.on('update-not-available', () => {
      this.emitStatus('not-available');
      this.triggerReady();
    });

    this.updater.on('error', (err: Error) => {
      this.logger.warn('[UpdaterManager] Error durante el proceso de actualización:', err?.message);
      this.emitStatus('error', 0, undefined, err?.message);
      this.triggerReady();
    });
  }

  public restartAndInstall(): void {
    if (this.updater && this.currentState === 'downloaded') {
      // isSilent: true para actualización desatendida sin asistente
      // isForceRunAfter: true para reinicio inmediato automático
      this.updater.quitAndInstall(true, true);
    } else {
      this.triggerReady();
    }
  }

  public skip(): void {
    this.triggerReady();
  }
}
