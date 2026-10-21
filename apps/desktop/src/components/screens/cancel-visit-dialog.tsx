import React, { useState, useEffect } from 'react';
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
import { visitsService as defaultVisitsService, VisitsService } from '../../services/visits.service';
import { ApiError } from '../../services/api.client';
import styles from './cancel-visit-dialog.module.css';

export interface CancelVisitDialogProps {
  /**
   * Determina si el diálogo modal se encuentra abierto.
   */
  isOpen: boolean;
  /**
   * Identificador de la visita a cancelar (RF-41).
   */
  visitId: string;
  /**
   * Motivo original registrado en la visita (opcional para contexto).
   */
  visitReason?: string;
  /**
   * Nombre de la mascota vinculada a la visita (opcional para contexto).
   */
  petName?: string;
  /**
   * Callback invocado al cancelar o cerrar el diálogo sin aplicar cambios.
   */
  onClose: () => void;
  /**
   * Callback invocado tras la cancelación exitosa en el backend.
   */
  onCancelled?: () => void;
  /**
   * Instancia del servicio de visitas (opcional para inyección en pruebas).
   */
  visitsService?: VisitsService;
  /**
   * Motivo inicial pre-cargado para pruebas o edición.
   */
  initialReason?: string;
}

const MIN_REASON_LENGTH = 10;

/**
 * Diálogo accesible de confirmación para cancelación justificada obligatoria de citas (T35 / RF-41, RF-42).
 * Construido sobre primitivas de Radix AlertDialog (RNF-3).
 *
 * El botón de confirmación permanece estrictamente deshabilitado hasta que el usuario
 * ingrese una justificación textual de al menos 10 caracteres (RF-42).
 */
export const CancelVisitDialog: React.FC<CancelVisitDialogProps> = ({
  isOpen,
  visitId,
  visitReason,
  petName,
  onClose,
  onCancelled,
  visitsService = defaultVisitsService,
  initialReason = '',
}) => {
  const [reason, setReason] = useState<string>(initialReason);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason(initialReason);
      setErrorMessage(null);
    }
  }, [isOpen, initialReason]);

  const trimmedLength = reason.trim().length;
  const isValidReason = trimmedLength >= MIN_REASON_LENGTH;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isValidReason || isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await visitsService.cancelVisit(visitId, {
        cancellationReason: reason.trim(),
      });

      if (onCancelled) {
        onCancelled();
      }
      onClose();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.message) {
        setErrorMessage(error.message);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Ocurrió un error al intentar cancelar la cita médica');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className={styles.dialogContent}>
        <AlertDialogHeader className={styles.header}>
          <div className={styles.iconContainer} aria-hidden="true">
            <svg
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <AlertDialogTitle className={styles.title}>
              Cancelar Cita Médica
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.description}>
              ¿Está seguro de que desea cancelar esta cita
              {petName ? (
                <> para el paciente <strong className={styles.patientHighlight}>{petName}</strong></>
              ) : null}
              {visitReason ? ` (${visitReason})` : ''}
              ? Esta acción liberará el horario de agenda del profesional (RF-41).
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        {errorMessage && (
          <div className={styles.errorAlert} role="alert">
            {errorMessage}
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="cancel-visit-reason" className={styles.label}>
            <span>Motivo de cancelación (obligatorio)</span>
            <span
              className={[
                styles.charCounter,
                isValidReason ? styles.charCounterValid : styles.charCounterInvalid,
              ].join(' ')}
            >
              {trimmedLength}/{MIN_REASON_LENGTH} caracteres (Mínimo 10 caracteres)
            </span>
          </label>

          <textarea
            id="cancel-visit-reason"
            placeholder="Especifique detalladamente el motivo de la cancelación..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={styles.textarea}
            disabled={isLoading}
            required
            aria-required="true"
            aria-invalid={!isValidReason}
          />

          {!isValidReason && (
            <p className={styles.requirementNote} role="status">
              Ingrese al menos 10 caracteres para habilitar la confirmación (RF-42).
            </p>
          )}
        </div>

        <AlertDialogFooter className={styles.footer}>
          <AlertDialogCancel
            onClick={onClose}
            disabled={isLoading}
            className={styles.cancelBtn}
          >
            Volver
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isValidReason || isLoading}
            aria-disabled={!isValidReason || isLoading}
            data-action="confirm"
            className={styles.confirmBtn}
          >
            {isLoading ? 'Cancelando...' : 'Confirmar Cancelación'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
