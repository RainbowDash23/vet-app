import type { ITagReader } from '../src/readers/tag-reader.interface';
import type { HardwareStatus } from '@vet-app/shared-types';

/**
 * Expresión regular para validación estricta de UID de 8 a 14 caracteres hexadecimales (RF-27).
 */
export const FAKE_TAG_UID_REGEX = /^[0-9A-Fa-f]{8,14}$/;

/**
 * Simulador de hardware lector NFC para entornos de desarrollo y pruebas automatizadas (RF-27, RNF-4, RNF-5).
 * Implementa el contrato ITagReader y permite inyectar UIDs artificiales, emular latencia física y secuencias.
 */
export class FakeTagReader implements ITagReader {
  private active = false;
  private currentStatus: HardwareStatus = {
    connected: false,
    portName: null,
    reconnecting: false,
    attemptCount: 0,
  };

  private readonly tagCallbacks = new Set<(uid: string) => void>();
  private readonly statusCallbacks = new Set<(status: HardwareStatus) => void>();
  private readonly pendingCancelers = new Set<() => void>();

  /**
   * Activa el lector simulado y conmuta su estado a conectado.
   */
  public start(): void {
    this.active = true;
    this.currentStatus = {
      connected: true,
      portName: 'SIMULATOR',
      reconnecting: false,
      attemptCount: 0,
    };
    this.notifyStatusListeners();
  }

  /**
   * Detiene el lector, cancela temporizadores pendientes y conmuta a desconectado.
   */
  public stop(): void {
    this.active = false;

    // Cancela y rechaza cualquier operación asíncrona o retardo en curso
    for (const cancel of Array.from(this.pendingCancelers)) {
      cancel();
    }
    this.pendingCancelers.clear();

    this.currentStatus = {
      connected: false,
      portName: null,
      reconnecting: false,
      attemptCount: 0,
    };
    this.notifyStatusListeners();
  }

  /**
   * Suscribe un callback para eventos de lectura de tag NFC.
   * @returns Función de desuscripción limpia.
   */
  public onTagDetected(callback: (uid: string) => void): () => void {
    this.tagCallbacks.add(callback);
    return () => {
      this.tagCallbacks.delete(callback);
    };
  }

  /**
   * Alias de conveniencia compatible con onTagDetected.
   */
  public onTag(callback: (uid: string) => void): () => void {
    return this.onTagDetected(callback);
  }

  /**
   * Suscribe un callback para cambios de estado del hardware simulado.
   * @returns Función de desuscripción limpia.
   */
  public onStatusChange(callback: (status: HardwareStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Alias de conveniencia compatible con onStatusChange.
   */
  public onStatus(callback: (status: HardwareStatus) => void): () => void {
    return this.onStatusChange(callback);
  }

  /**
   * Inyecta un UID artificial simulando la lectura de un tag NFC físico (RF-27, RNF-4, RNF-5).
   * @param uid Identificador del tag (con o sin prefijo 'UID:').
   * @param delayMs Retardo opcional en milisegundos para simular latencia física de lectura.
   */
  public async simulateTag(uid: string, delayMs = 0): Promise<void> {
    if (!this.active) {
      throw new Error('FakeTagReader is not active');
    }

    const trimmed = uid.trim();
    const raw = trimmed.startsWith('UID:') ? trimmed.slice(4).trim() : trimmed;

    if (!FAKE_TAG_UID_REGEX.test(raw)) {
      throw new Error('Invalid UID format');
    }

    const normalizedUid = raw.toUpperCase();

    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;

        const cancel = () => {
          clearTimeout(timer);
          this.pendingCancelers.delete(cancel);
          reject(new Error('FakeTagReader is not active'));
        };
        this.pendingCancelers.add(cancel);

        timer = setTimeout(() => {
          this.pendingCancelers.delete(cancel);
          if (!this.active) {
            reject(new Error('FakeTagReader is not active'));
          } else {
            resolve();
          }
        }, delayMs);
      });
    }

    if (!this.active) {
      throw new Error('FakeTagReader is not active');
    }

    this.notifyTagListeners(normalizedUid);
  }

  /**
   * Emite una secuencia ordenada de UIDs con retardo configurable entre emisiones para pruebas e2e.
   */
  public async simulateSequence(uids: string[], intervalMs = 100): Promise<void> {
    if (!this.active) {
      throw new Error('FakeTagReader is not active');
    }

    for (let i = 0; i < uids.length; i++) {
      if (!this.active) {
        throw new Error('FakeTagReader is not active');
      }

      const uid = uids[i];
      await this.simulateTag(uid, 0);

      if (i < uids.length - 1 && intervalMs > 0) {
        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout>;

          const cancel = () => {
            clearTimeout(timer);
            this.pendingCancelers.delete(cancel);
            reject(new Error('FakeTagReader is not active'));
          };
          this.pendingCancelers.add(cancel);

          timer = setTimeout(() => {
            this.pendingCancelers.delete(cancel);
            if (!this.active) {
              reject(new Error('FakeTagReader is not active'));
            } else {
              resolve();
            }
          }, intervalMs);
        });
      }
    }
  }

  /**
   * Conmuta el estado del simulador a desconectado.
   */
  public simulateDisconnect(): void {
    this.currentStatus = {
      connected: false,
      portName: null,
      reconnecting: false,
      attemptCount: 0,
    };
    this.notifyStatusListeners();
  }

  /**
   * Conmuta el estado del simulador a conectado.
   */
  public simulateReconnect(): void {
    this.currentStatus = {
      connected: true,
      portName: 'SIMULATOR',
      reconnecting: false,
      attemptCount: 0,
    };
    this.notifyStatusListeners();
  }

  /**
   * Retorna una copia del estado actual del hardware simulado.
   */
  public getStatus(): HardwareStatus {
    return { ...this.currentStatus };
  }

  /**
   * Indica si el lector simulado se encuentra actualmente activo.
   */
  public isActive(): boolean {
    return this.active;
  }

  private notifyTagListeners(uid: string): void {
    for (const callback of this.tagCallbacks) {
      try {
        callback(uid);
      } catch (error) {
        console.error('[FakeTagReader] Error en callback de tag:', error);
      }
    }
  }

  private notifyStatusListeners(): void {
    const statusCopy = this.getStatus();
    for (const callback of this.statusCallbacks) {
      try {
        callback(statusCopy);
      } catch (error) {
        console.error('[FakeTagReader] Error en callback de estado:', error);
      }
    }
  }
}
