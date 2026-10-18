import React, {
  useState,
  useRef,
  useCallback,
  useContext,
  createContext,
  type ReactNode,
} from 'react';
import { useNfcReader } from './use-nfc-reader';

/**
 * Opciones para configurar el hook useFormDirtyGuard.
 */
export interface UseFormDirtyGuardOptions {
  /**
   * Estado de suciedad inicial del formulario (por defecto false).
   */
  initialDirty?: boolean;
  /**
   * Callback invocado para resolver el paciente y navegar hacia su ficha clínica
   * cuando no hay cambios no guardados o tras confirmar el descarte.
   */
  onResolveTag?: (uid: string) => void;
  /**
   * Si debe suscribirse de forma reactiva a las lecturas NFC. Por defecto true si hay onResolveTag.
   */
  autoListenNfc?: boolean;
}

/**
 * Estado y métodos expuestos por el guardia de navegación y cambios no guardados.
 */
export interface DirtyGuardState {
  /**
   * Indica si el formulario activo mantiene cambios no guardados.
   */
  readonly isDirty: boolean;
  /**
   * Actualiza el estado sucio del formulario.
   */
  setIsDirty: (dirty: boolean) => void;
  /**
   * Alias de setIsDirty para compatibilidad.
   */
  setDirtyState: (dirty: boolean) => void;
  /**
   * UID del tag interceptado pendiente de confirmación de descarte (RF-33).
   */
  readonly pendingUid: string | null;
  /**
   * Indica si el diálogo de advertencia de cambios no guardados debe desplegarse.
   */
  readonly showUnsavedDialog: boolean;
  /**
   * Procesa la llegada de un UID. Retorna true si procedió directamente, false si fue interceptado.
   */
  handleTagDetected: (uid: string) => boolean;
  /**
   * Confirma el descarte de cambios: limpia isDirty, cierra el diálogo y despacha la resolución del tag pendiente (RF-33).
   */
  confirmDiscard: () => void;
  /**
   * Cancela el descarte: descarta el tag pendiente, cierra el diálogo y preserva intacto el formulario (RF-33).
   */
  cancelDiscard: () => void;
  /**
   * Restablece el guard a su estado inicial limpio.
   */
  resetGuard: () => void;
}

/**
 * Hook para la gestión de formularios sucios y protección ante navegación no deseada
 * disparada por escaneos concurrentes de llaveros NFC (RF-33).
 */
export function useFormDirtyGuard(options: UseFormDirtyGuardOptions = {}): DirtyGuardState {
  const { initialDirty = false, onResolveTag, autoListenNfc = true } = options;

  const [, setRenderTrigger] = useState<number>(0);
  const isDirtyRef = useRef<boolean>(initialDirty);
  const pendingUidRef = useRef<string | null>(null);
  const showUnsavedDialogRef = useRef<boolean>(false);

  const onResolveTagRef = useRef(onResolveTag);
  onResolveTagRef.current = onResolveTag;

  const triggerRerender = useCallback(() => {
    setRenderTrigger((prev) => prev + 1);
  }, []);

  const setIsDirty = useCallback(
    (dirty: boolean) => {
      isDirtyRef.current = dirty;
      triggerRerender();
    },
    [triggerRerender]
  );

  const handleTagDetected = useCallback(
    (uid: string): boolean => {
      if (isDirtyRef.current) {
        // Interceptar conforme a RF-33: detener navegación y alertar al operador
        pendingUidRef.current = uid;
        showUnsavedDialogRef.current = true;
        triggerRerender();
        return false;
      }

      // Flujo normal: no hay cambios pendientes, resolver de inmediato
      if (onResolveTagRef.current) {
        onResolveTagRef.current(uid);
      }
      return true;
    },
    [triggerRerender]
  );

  const confirmDiscard = useCallback(() => {
    const targetUid = pendingUidRef.current;
    isDirtyRef.current = false;
    pendingUidRef.current = null;
    showUnsavedDialogRef.current = false;
    triggerRerender();

    if (targetUid && onResolveTagRef.current) {
      onResolveTagRef.current(targetUid);
    }
  }, [triggerRerender]);

  const cancelDiscard = useCallback(() => {
    // Descartar el UID pendiente y cerrar diálogo preservando intacto isDirty
    pendingUidRef.current = null;
    showUnsavedDialogRef.current = false;
    triggerRerender();
  }, [triggerRerender]);

  const resetGuard = useCallback(() => {
    isDirtyRef.current = false;
    pendingUidRef.current = null;
    showUnsavedDialogRef.current = false;
    triggerRerender();
  }, [triggerRerender]);

  // Suscripción automática a NFC si está habilitado
  useNfcReader({
    enabled: autoListenNfc && Boolean(onResolveTag),
    onTagDetected: (uid) => {
      handleTagDetected(uid);
    },
  });

  return {
    get isDirty() {
      return isDirtyRef.current;
    },
    setIsDirty,
    setDirtyState: setIsDirty,
    get pendingUid() {
      return pendingUidRef.current;
    },
    get showUnsavedDialog() {
      return showUnsavedDialogRef.current;
    },
    handleTagDetected,
    confirmDiscard,
    cancelDiscard,
    resetGuard,
  };
}

export const DirtyGuardContext = createContext<DirtyGuardState | null>(null);

export interface DirtyGuardProviderProps {
  children: ReactNode;
  initialDirty?: boolean;
  onResolveTag?: (uid: string) => void;
  autoListenNfc?: boolean;
}

/**
 * Proveedor de contexto global/de pantalla para DirtyStateGuard (RF-33).
 */
export const DirtyGuardProvider: React.FC<DirtyGuardProviderProps> = ({
  children,
  initialDirty = false,
  onResolveTag,
  autoListenNfc = true,
}) => {
  const guard = useFormDirtyGuard({
    initialDirty,
    onResolveTag,
    autoListenNfc,
  });

  return React.createElement(DirtyGuardContext.Provider, { value: guard }, children);
};

/**
 * Hook para consumir la API de DirtyStateGuard desde cualquier componente hijo de forma segura,
 * retornando null si no se encuentra dentro de un DirtyGuardProvider en lugar de lanzar excepción.
 */
export function useSafeDirtyGuard(): DirtyGuardState | null {
  return useContext(DirtyGuardContext);
}

/**
 * Hook para consumir la API de DirtyStateGuard desde cualquier componente hijo.
 */
export function useDirtyGuard(): DirtyGuardState {
  const context = useContext(DirtyGuardContext);
  if (!context) {
    throw new Error('useDirtyGuard debe ser utilizado dentro de un DirtyGuardProvider');
  }
  return context;
}
