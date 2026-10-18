import type { TagReader } from './tag-reader.interface';
import type { HardwareStatus } from '@vet-app/shared-types';

/**
 * Implementación simulada de TagReader en proceso Renderer para desarrollo y pruebas de UI.
 * Permite emitir eventos de lectura de llaveros NFC sin requerir el hardware físico conectado.
 */
export class FakeTagReader implements TagReader {
  private listeners: Array<(uid: string) => void> = [];
  private active = true;

  constructor() {
    // Si la aplicación corre dentro de Electron, también escuchamos los eventos nativos del preload
    if (typeof window !== 'undefined' && window.electronAPI?.onTagDetected) {
      window.electronAPI.onTagDetected((uid) => {
        this.notifyListeners(uid);
      });
    }
  }

  public start(): void {
    this.active = true;
  }

  public stop(): void {
    this.active = false;
    this.listeners = [];
  }

  public isActive(): boolean {
    return this.active;
  }

  public getStatus(): HardwareStatus {
    return {
      connected: this.active,
      portName: this.active ? 'SIMULATOR-RENDERER' : null,
      reconnecting: false,
      attemptCount: 0,
    };
  }

  public onTagDetected(callback: (uid: string) => void): () => void {
    return this.onTag(callback);
  }

  public onTag(callback: (uid: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Emite un UID de prueba al presionar un botón en la interfaz o invocar el método.
   * Por defecto genera o usa un UID hexadecimal representativo.
   */
  public emitTag(uid = '04A1B2C3D4E5F6'): void {
    // Notificar al proceso principal de Electron si está disponible
    if (typeof window !== 'undefined' && window.electronAPI?.simulateHardwareTag) {
      void window.electronAPI.simulateHardwareTag(uid);
    } else {
      this.notifyListeners(uid);
    }
  }

  private notifyListeners(uid: string): void {
    for (const listener of this.listeners) {
      try {
        listener(uid);
      } catch (error) {
        console.error('[FakeTagReader] Error en listener al emitir UID:', error);
      }
    }
  }
}

// Instancia compartida del simulador de tags en renderer
export const fakeTagReader = new FakeTagReader();
