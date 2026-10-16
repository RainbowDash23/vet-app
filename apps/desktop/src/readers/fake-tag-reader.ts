import { TagReader } from './tag-reader.interface';

/**
 * Implementación simulada de TagReader para desarrollo y pruebas.
 * Permite emitir eventos de lectura de llaveros NFC sin requerir el hardware físico conectado.
 */
export class FakeTagReader implements TagReader {
  private listeners: Array<(uid: string) => void> = [];

  constructor() {
    // Si la aplicación corre dentro de Electron, también escuchamos los eventos nativos del preload
    if (typeof window !== 'undefined' && window.electronAPI?.onTagDetected) {
      window.electronAPI.onTagDetected((uid) => {
        this.notifyListeners(uid);
      });
    }
  }

  onTag(callback: (uid: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Emite un UID de prueba al presionar un botón en la interfaz o invocar el método.
   * Por defecto genera o usa un UID hexadecimal representativo.
   */
  emitTag(uid = '04A1B2C3D4E5F6'): void {
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

// Instancia compartida del simulador de tags
export const fakeTagReader = new FakeTagReader();
