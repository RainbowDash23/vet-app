import type { HardwareStatus } from '@vet-app/shared-types';

/**
 * Interfaz unificada para lectores de tags NFC (hardware serial real o simuladores de prueba).
 * Conforme a RF-27, RNF-4, RNF-5.
 */
export interface ITagReader {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  onTagDetected(callback: (uid: string) => void): () => void;
  simulateTag?(uid: string, delayMs?: number): Promise<void> | void;
  getStatus?(): HardwareStatus;
  isActive(): boolean;
}

/**
 * Función de callback para suscripción a eventos de detección de tag NFC.
 */
export type TagCallback = (uid: string) => void;

/**
 * Función de callback para suscripción a cambios de estado del hardware.
 */
export type HardwareStatusCallback = (status: HardwareStatus) => void;

/**
 * Interfaz de compatibilidad hacia atrás con componentes UI previos.
 */
export interface TagReader extends ITagReader {
  onTag(callback: (uid: string) => void): () => void;
}
