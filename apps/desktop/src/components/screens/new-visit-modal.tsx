import React, { useState, useEffect, useRef } from 'react';
import type { VisitResponseDto, CreateVisitDto } from '@vet-app/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '../ui';
import { CalendarIcon } from '../ui/icons';
import { visitsService as defaultVisitsService, VisitsService } from '../../services/visits.service';
import { ApiError } from '../../services/api.client';
import styles from './new-visit-modal.module.css';

export interface NewVisitModalProps {
  /**
   * Determina si el diálogo modal se encuentra abierto.
   */
  isOpen: boolean;
  /**
   * Callback invocado al cerrar el modal.
   */
  onClose: () => void;
  /**
   * Callback invocado tras la creación exitosa de la cita clínica (RF-39).
   */
  onVisitCreated?: (visit: VisitResponseDto) => void;
  /**
   * Instancia inyectable del servicio de visitas para pruebas unitarias.
   */
  visitsService?: VisitsService;
  /**
   * Lista de mascotas disponibles para agendar.
   */
  availablePets?: Array<{ id: string; name: string }>;
  /**
   * Lista de veterinarios disponibles para agendar.
   */
  availableVets?: Array<{ id: string; name: string; licenseNumber?: string }>;
  /**
   * Valores iniciales para el formulario.
   */
  initialPetId?: string;
  initialVetId?: string;
  initialScheduledDate?: string;
  initialDurationMinutes?: number;
  initialReason?: string;
  initialError?: string | null;
}

/**
 * Modal de agendamiento y creación de citas clínicas (T35 / RF-39, RF-40).
 * Construido sobre primitivas de Radix Dialog con semántica accesible WAI-ARIA
 * y estilizado 100% con CSS Modules y variables CSS nativas sin Tailwind ni shadcn (RNF-3).
 */
export const NewVisitModal: React.FC<NewVisitModalProps> = ({
  isOpen,
  onClose,
  onVisitCreated,
  visitsService = defaultVisitsService,
  availablePets = [],
  availableVets = [],
  initialPetId = '',
  initialVetId = '',
  initialScheduledDate = '',
  initialDurationMinutes = 30,
  initialReason = '',
  initialError = null,
}) => {
  const [petId, setPetId] = useState<string>(initialPetId);
  const [vetId, setVetId] = useState<string>(initialVetId);
  const [scheduledDate, setScheduledDate] = useState<string>(initialScheduledDate);
  const [durationMinutes, setDurationMinutes] = useState<number>(initialDurationMinutes);
  const [reason, setReason] = useState<string>(initialReason);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  // Sincronizar estado inicial al abrir el modal o cambiar props
  useEffect(() => {
    if (isOpen) {
      setPetId(initialPetId);
      setVetId(initialVetId);
      setScheduledDate(initialScheduledDate);
      setDurationMinutes(initialDurationMinutes || 30);
      setReason(initialReason);
      setErrorMessage(initialError ?? null);
    }
  }, [isOpen, initialPetId, initialVetId, initialScheduledDate, initialDurationMinutes, initialReason, initialError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validaciones mínimas en cliente
    if (!petId.trim()) {
      setErrorMessage('Debe seleccionar o especificar una mascota');
      return;
    }
    if (!vetId.trim()) {
      setErrorMessage('Debe seleccionar o especificar un veterinario');
      return;
    }
    if (!scheduledDate.trim()) {
      setErrorMessage('Debe especificar la fecha y hora de la cita');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Debe ingresar el motivo de la cita médica');
      return;
    }

    const duration = Number(durationMinutes);
    if (isNaN(duration) || duration < 15 || duration > 120) {
      setErrorMessage('La duración estimada debe situarse entre 15 y 120 minutos');
      return;
    }

    setIsLoading(true);

    try {
      const startTimeIso = new Date(scheduledDate).toISOString();
      const payload: CreateVisitDto = {
        petId: petId.trim(),
        vetId: vetId.trim(),
        startTime: startTimeIso,
        scheduledDate: startTimeIso,
        durationMinutes: duration,
        reason: reason.trim(),
      };

      const created = await visitsService.scheduleVisit(payload);

      if (onVisitCreated) {
        onVisitCreated(created);
      }
      onClose();
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      if (error instanceof ApiError && error.status === 409) {
        // Manejo explícito de colisión de horario de agenda (RF-40)
        setErrorMessage(
          'El veterinario presenta un solapamiento de horario con otra cita programada',
        );
      } else if (error instanceof ApiError && error.message) {
        setErrorMessage(error.message);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Ocurrió un error inesperado al intentar agendar la cita');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.modalContent}>
        <DialogHeader className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.iconBadge} aria-hidden="true">
              <CalendarIcon size={18} />
            </div>
            <div>
              <DialogTitle className={styles.title}>
                Nueva Cita Médica
              </DialogTitle>
              <DialogDescription className={styles.description}>
                Agende una consulta clínica especificando paciente, veterinario responsable, fecha y duración estimada (RF-39).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Retroalimentación visual accesible ante conflicto de solapamiento o error (RF-40) */}
        {errorMessage && (
          <div className={styles.errorAlert} role="alert">
            <svg
              className={styles.errorIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className={styles.errorText}>{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Selección de Mascota */}
          <div className={styles.fieldGroup}>
            <label htmlFor="new-visit-pet" className={styles.label}>
              Mascota <span className={styles.requiredMark}>*</span>
            </label>
            {availablePets.length > 0 ? (
              <select
                id="new-visit-pet"
                value={petId}
                onChange={(e) => setPetId(e.target.value)}
                className={styles.select}
                disabled={isLoading}
                required
              >
                <option value="">-- Seleccionar Mascota --</option>
                {availablePets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="new-visit-pet"
                type="text"
                placeholder="UUID de la mascota"
                value={petId}
                onChange={(e) => setPetId(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                required
              />
            )}
          </div>

          {/* Selección de Veterinario */}
          <div className={styles.fieldGroup}>
            <label htmlFor="new-visit-vet" className={styles.label}>
              Veterinario <span className={styles.requiredMark}>*</span>
            </label>
            {availableVets.length > 0 ? (
              <select
                id="new-visit-vet"
                value={vetId}
                onChange={(e) => setVetId(e.target.value)}
                className={styles.select}
                disabled={isLoading}
                required
              >
                <option value="">-- Seleccionar Veterinario --</option>
                {availableVets.map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.name} {vet.licenseNumber ? `(MP: ${vet.licenseNumber})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="new-visit-vet"
                type="text"
                placeholder="UUID del veterinario"
                value={vetId}
                onChange={(e) => setVetId(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                required
              />
            )}
          </div>

          {/* Fecha y Duración */}
          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-visit-date" className={styles.label}>
                Fecha y Hora <span className={styles.requiredMark}>*</span>
              </label>
              <input
                id="new-visit-date"
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="new-visit-duration" className={styles.label}>
                Duración (min) <span className={styles.requiredMark}>*</span>
              </label>
              <input
                id="new-visit-duration"
                type="number"
                min={15}
                max={120}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={styles.input}
                disabled={isLoading}
                required
              />
              <p className={styles.hintText}>De 15 a 120 minutos (defecto 30)</p>
            </div>
          </div>

          {/* Motivo de la Cita */}
          <div className={styles.fieldGroup}>
            <label htmlFor="new-visit-reason" className={styles.label}>
              Motivo de Atención <span className={styles.requiredMark}>*</span>
            </label>
            <textarea
              id="new-visit-reason"
              placeholder="Describa el motivo o sintomatología reportada..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.textarea}
              disabled={isLoading}
              required
            />
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
              isLoading={isLoading}
            >
              Agendar Cita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
