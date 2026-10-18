import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '../ui';
import { visitsService as defaultVisitsService, VisitsService } from '../../services/visits.service';
import { ApiError } from '../../services/api.client';
import styles from './add-note-modal.module.css';

export interface AddNoteModalProps {
  /**
   * Determina si el diálogo modal se encuentra abierto.
   */
  isOpen: boolean;
  /**
   * Identificador de la visita médica cerrada (RF-46).
   */
  visitId: string;
  /**
   * Callback invocado al cancelar o cerrar el diálogo.
   */
  onClose: () => void;
  /**
   * Callback invocado tras la adición exitosa de la nota evolutiva (RF-46).
   */
  onNoteAdded?: (note: any) => void;
  /**
   * Instancia del servicio de visitas (opcional para inyección en pruebas).
   */
  visitsService?: VisitsService;
  /**
   * Contenido inicial pre-cargado para pruebas o inicialización.
   */
  initialContent?: string;
}

const MIN_NOTE_LENGTH = 5;

/**
 * Diálogo modal accesible para el registro de notas evolutivas complementarias inmutables (T36 / RF-46).
 * Construido sobre primitivas de Radix Dialog (RNF-3).
 *
 * El botón de confirmación permanece estrictamente deshabilitado hasta que el usuario
 * ingrese un contenido textual de al menos 5 caracteres (RF-46).
 */
export const AddNoteModal: React.FC<AddNoteModalProps> = ({
  isOpen,
  visitId,
  onClose,
  onNoteAdded,
  visitsService = defaultVisitsService,
  initialContent = '',
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      setErrorMessage(null);
    }
  }, [isOpen, initialContent]);

  const trimmedLength = content.trim().length;
  const isValidContent = trimmedLength >= MIN_NOTE_LENGTH;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidContent || isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const createdNote = await visitsService.addVisitNote(visitId, {
        content: content.trim(),
      });

      if (onNoteAdded) {
        onNoteAdded(createdNote);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'Error al registrar la nota de evolución');
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Ocurrió un error inesperado al registrar la nota');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader className={styles.header}>
          <div className={styles.iconContainer} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <DialogTitle className={styles.title}>
              Añadir Nota de Evolución
            </DialogTitle>
            <DialogDescription className={styles.description}>
              Registre aclaraciones, notas de evolución o seguimiento clínico sobre la visita cerrada. Esta entrada será inmutable (RF-46).
            </DialogDescription>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className={styles.errorBanner} role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleConfirm}>
          <div className={styles.formGroup}>
            <div className={styles.label}>
              <label htmlFor="note-content">Contenido de la nota clínica</label>
              <span
                className={`${styles.charCounter} ${isValidContent ? styles.charCounterValid : styles.charCounterInvalid}`}
                aria-live="polite"
              >
                {trimmedLength} / mín. {MIN_NOTE_LENGTH} caracteres
              </span>
            </div>
            <textarea
              id="note-content"
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describa la evolución del paciente, resultados de laboratorio complementarios o aclaraciones terapéuticas..."
              disabled={isLoading}
              className={`${styles.textarea} ${errorMessage ? styles.textareaError : ''}`}
              rows={4}
              required
            />
            <span className={styles.helperText}>
              Mínimo 5 caracteres requeridos para persistencia inmutable (RF-46).
            </span>
          </div>

          <DialogFooter className={styles.footer}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isValidContent || isLoading}
              isLoading={isLoading}
            >
              Guardar Nota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
