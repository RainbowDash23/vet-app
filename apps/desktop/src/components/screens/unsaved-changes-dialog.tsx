import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui';
import styles from './unsaved-changes-dialog.module.css';

/**
 * Propiedades del diálogo de confirmación ante cambios no guardados.
 */
export interface UnsavedChangesDialogProps {
  /**
   * Determina si el diálogo modal se encuentra abierto.
   */
  isOpen: boolean;
  /**
   * UID del tag NFC detectado durante la edición del formulario (RF-33).
   */
  pendingUid?: string | null;
  /**
   * Callback invocado al confirmar el descarte de cambios y proseguir con la resolución.
   */
  onConfirm: () => void;
  /**
   * Callback invocado al cancelar el descarte y permanecer en el formulario activo.
   */
  onCancel: () => void;
}

/**
 * Componente modal accesible que advierte al operador sobre el riesgo de pérdida de datos
 * ante la aproximación concurrente de un llavero NFC mientras existen cambios no guardados (RF-33).
 *
 * Construido sobre las primitivas accesibles de AlertDialog de src/components/ui/ (RNF-3).
 */
export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  pendingUid,
  onConfirm,
  onCancel,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className={styles.dialogContent}>
        <AlertDialogHeader className={styles.header}>
          <div className={styles.iconContainer} aria-hidden="true">
            <svg
              className={styles.warningIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              width="24"
              height="24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <AlertDialogTitle className={styles.title}>
              Cambios no guardados en el formulario
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.description}>
              Se ha detectado el escaneo de un llavero NFC
              {pendingUid ? (
                <> (UID: <strong className={styles.uidBadge}>{pendingUid}</strong>)</>
              ) : null}
              . Si continúa y navega hacia la nueva ficha clínica, se perderán
              todos los cambios no guardados en el formulario actual (RF-33).
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        <div className={styles.warningAlert} role="note">
          <p className={styles.warningText}>
            Advertencia: Esta acción descartará permanentemente los datos no guardados.
            Para conservarlos, seleccione «Permanecer en el formulario» y guarde el registro.
          </p>
        </div>

        <AlertDialogFooter className={styles.footer}>
          <AlertDialogCancel onClick={onCancel} className={styles.cancelButton}>
            Permanecer en el formulario
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={styles.confirmButton}>
            Confirmar y Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
