/**
 * Interfaz que define el contrato de cualquier transceptor o lector de tags/llaveros NFC.
 * Permite desacoplar el hardware real (puerto serial / USB MicroPython) de la UI.
 */
export interface TagReader {
  /**
   * Registra un callback que se invocará cada vez que se detecte un tag NFC.
   * @param callback Función receptora del UID hexadecimal leído.
   * @returns Función de desuscripción para limpieza de listeners.
   */
  onTag(callback: (uid: string) => void): () => void;
}
