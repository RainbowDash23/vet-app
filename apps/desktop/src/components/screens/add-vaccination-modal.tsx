import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { VaccinationResponseDto } from '@vet-app/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from '../ui';
import {
  vaccinationsService as defaultVaccinationsService,
  VaccinationsService,
} from '../../services/vaccinations.service';
import { ApiError } from '../../services/api.client';
import styles from './add-vaccination-modal.module.css';

export const addVaccinationSchema = z.object({
  vaccineName: z
    .string()
    .min(2, 'El nombre del biológico debe contener al menos 2 caracteres')
    .max(100, 'El nombre del biológico no puede exceder 100 caracteres'),
  batchNumber: z
    .string()
    .max(50, 'El número de lote no puede exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  appliedAt: z.string().min(1, 'La fecha de aplicación es obligatoria'),
  nextDueDate: z.string().optional().or(z.literal('')),
  notes: z
    .string()
    .max(500, 'Las notas no pueden exceder 500 caracteres')
    .optional()
    .or(z.literal('')),
});

export type AddVaccinationFormValues = z.infer<typeof addVaccinationSchema>;

export interface AddVaccinationModalProps {
  isOpen: boolean;
  petId: string;
  onClose: () => void;
  onVaccinationCreated: (vaccination: VaccinationResponseDto) => void;
  vaccinationsService?: VaccinationsService;
}

export const AddVaccinationModal: React.FC<AddVaccinationModalProps> = ({
  isOpen,
  petId,
  onClose,
  onVaccinationCreated,
  vaccinationsService = defaultVaccinationsService,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddVaccinationFormValues>({
    resolver: zodResolver(addVaccinationSchema),
    defaultValues: {
      vaccineName: '',
      batchNumber: '',
      appliedAt: todayStr,
      nextDueDate: '',
      notes: '',
    },
  });

  const onSubmit = async (values: AddVaccinationFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await vaccinationsService.createVaccination({
        petId,
        vaccineName: values.vaccineName.trim(),
        batchNumber: values.batchNumber?.trim() || null,
        appliedAt: new Date(values.appliedAt).toISOString(),
        nextDueDate: values.nextDueDate ? new Date(values.nextDueDate).toISOString() : null,
        notes: values.notes?.trim() || null,
      });

      reset();
      onVaccinationCreated(created);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Error al registrar la aplicación de la vacuna';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.modalContent} aria-describedby="add-vaccination-desc">
        <DialogHeader>
          <DialogTitle>Registrar Aplicación de Vacuna</DialogTitle>
          <DialogDescription id="add-vaccination-desc">
            Asiente la vacuna aplicada al carnet sanitario del paciente con su fecha de refuerzo.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className={styles.alertError} role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="vaccine-name" className={styles.label}>
              Nombre del Biológico / Vacuna *
            </label>
            <Input
              id="vaccine-name"
              placeholder="Ej: Antirrábica, Séxtuple Canina, Triple Felina"
              disabled={isSubmitting}
              aria-invalid={!!errors.vaccineName}
              {...register('vaccineName')}
            />
            {errors.vaccineName && (
              <span className={styles.errorText} role="alert">
                {errors.vaccineName.message}
              </span>
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="vaccine-batch" className={styles.label}>
                Número de Lote
              </label>
              <Input
                id="vaccine-batch"
                placeholder="Ej: LOT-2026-X9"
                disabled={isSubmitting}
                aria-invalid={!!errors.batchNumber}
                {...register('batchNumber')}
              />
              {errors.batchNumber && (
                <span className={styles.errorText} role="alert">
                  {errors.batchNumber.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="vaccine-applied-at" className={styles.label}>
                Fecha de Aplicación *
              </label>
              <Input
                id="vaccine-applied-at"
                type="date"
                disabled={isSubmitting}
                aria-invalid={!!errors.appliedAt}
                {...register('appliedAt')}
              />
              {errors.appliedAt && (
                <span className={styles.errorText} role="alert">
                  {errors.appliedAt.message}
                </span>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="vaccine-next-due" className={styles.label}>
              Próximo Refuerzo (Opcional)
            </label>
            <Input
              id="vaccine-next-due"
              type="date"
              disabled={isSubmitting}
              aria-invalid={!!errors.nextDueDate}
              {...register('nextDueDate')}
            />
            <span className={styles.hint}>
              Fecha sugerida para la revacunación o refuerzo inmunológico.
            </span>
            {errors.nextDueDate && (
              <span className={styles.errorText} role="alert">
                {errors.nextDueDate.message}
              </span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="vaccine-notes" className={styles.label}>
              Observaciones o Reacciones
            </label>
            <textarea
              id="vaccine-notes"
              className={styles.textarea}
              placeholder="Vía de administración, sitio de inoculación o notas clínicas..."
              disabled={isSubmitting}
              {...register('notes')}
            />
          </div>

          <div className={styles.footer}>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar Vacuna'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
