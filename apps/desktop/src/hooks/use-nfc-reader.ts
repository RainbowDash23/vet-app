import { useState, useEffect, useRef, useCallback } from 'react';
import { fakeTagReader } from '../readers/fake-tag-reader';

/**
 * Opciones de configuración para el hook useNfcReader.
 */
export interface UseNfcReaderOptions {
  /**
   * Callback invocado ante la detección de un UID válido por el hardware serial o el simulador.
   */
  onTagDetected?: (uid: string) => void;
  /**
   * Indica si la escucha debe estar activa (por defecto true).
   */
  enabled?: boolean;
}

/**
 * Valor de retorno del hook useNfcReader.
 */
export interface UseNfcReaderReturn {
  /**
   * Último UID de llavero NFC detectado en la sesión.
   */
  lastTagUid: string | null;
  /**
   * Indica si el hook está activamente escuchando eventos de lectura.
   */
  isListening: boolean;
  /**
   * Limpia el último tag detectado en memoria.
   */
  resetLastTag: () => void;
}

/**
 * Hook de React para la escucha reactiva de transpondedores NFC (RF-27, RF-33).
 * Se conecta a window.electronAPI.onTagDetected si se ejecuta dentro del cliente Electron,
 * o a fakeTagReader en entornos web de prueba y desarrollo.
 */
export function useNfcReader(
  callbackOrOptions?: ((uid: string) => void) | UseNfcReaderOptions
): UseNfcReaderReturn {
  const onTagDetected =
    typeof callbackOrOptions === 'function'
      ? callbackOrOptions
      : callbackOrOptions?.onTagDetected;

  const enabled =
    typeof callbackOrOptions === 'object' && callbackOrOptions !== null
      ? (callbackOrOptions.enabled ?? true)
      : true;

  const [lastTagUid, setLastTagUid] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(enabled);

  const callbackRef = useRef(onTagDetected);
  callbackRef.current = onTagDetected;

  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Inicializar o actualizar suscripción
  if (enabled && !unsubscribeRef.current) {
    const handleTag = (uid: string) => {
      setLastTagUid(uid);
      if (callbackRef.current) {
        callbackRef.current(uid);
      }
    };

    if (typeof window !== 'undefined' && window.electronAPI?.onTagDetected) {
      unsubscribeRef.current = window.electronAPI.onTagDetected(handleTag);
    } else {
      unsubscribeRef.current = fakeTagReader.onTagDetected(handleTag);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setIsListening(false);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return;
    }

    setIsListening(true);

    return () => {
      setIsListening(false);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enabled]);

  const resetLastTag = useCallback(() => {
    setLastTagUid(null);
  }, []);

  return {
    lastTagUid,
    isListening,
    resetLastTag,
  };
}
