import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PetSpecies,
  PetSex,
  ReproductiveStatus,
  PetResponseDto,
} from '@vet-app/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from '../ui';
import { petsService as defaultPetsService, PetsService } from '../../services/pets.service';
import { ApiError } from '../../services/api.client';
import styles from './edit-pet-modal.module.css';

export const editPetSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre del paciente es obligatorio')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  species: z.nativeEnum(PetSpecies, {
    errorMap: () => ({ message: 'Seleccione una especie válida' }),
  }),
  breed: z
    .string()
    .max(100, 'La raza no puede exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  sex: z.nativeEnum(PetSex, {
    errorMap: () => ({ message: 'Seleccione el sexo del paciente' }),
  }),
  birthDate: z.string().optional().or(z.literal('')),
  isApproximateBirthDate: z.boolean().optional(),
  color: z
    .string()
    .max(50, 'El color no puede exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  reproductiveStatus: z.nativeEnum(ReproductiveStatus, {
    errorMap: () => ({ message: 'Seleccione un estado reproductivo válido' }),
  }),
  notes: z.string().optional().or(z.literal('')),
});

export type EditPetFormValues = z.infer<typeof editPetSchema>;

export interface EditPetModalProps {
  isOpen: boolean;
  pet: PetResponseDto | null;
  onClose: () => void;
  onPetUpdated: (updated: PetResponseDto) => void;
  petsService?: PetsService;
}

export const EditPetModal: React.FC<EditPetModalProps> = ({
  isOpen,
  pet,
  onClose,
  onPetUpdated,
  petsService = defaultPetsService,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditPetFormValues>({
    resolver: zodResolver(editPetSchema),
    defaultValues: {
      name: pet?.name ?? '',
      species: pet?.species ?? PetSpecies.CANINE,
      breed: pet?.breed ?? '',
      sex: pet?.sex ?? PetSex.UNKNOWN,
      birthDate: pet?.birthDate ? new Date(pet.birthDate).toISOString().split('T')[0] : '',
      isApproximateBirthDate: pet?.isApproximateBirthDate ?? false,
      color: pet?.color ?? '',
      reproductiveStatus: pet?.reproductiveStatus ?? ReproductiveStatus.UNKNOWN,
      notes: pet?.notes ?? '',
    },
  });

  useEffect(() => {
    if (pet && isOpen) {
      reset({
        name: pet.name ?? '',
        species: pet.species ?? PetSpecies.CANINE,
        breed: pet.breed ?? '',
        sex: pet.sex ?? PetSex.UNKNOWN,
        birthDate: pet.birthDate ? new Date(pet.birthDate).toISOString().split('T')[0] : '',
        isApproximateBirthDate: pet.isApproximateBirthDate ?? false,
        color: pet.color ?? '',
        reproductiveStatus: pet.reproductiveStatus ?? ReproductiveStatus.UNKNOWN,
        notes: pet.notes ?? '',
      });
      setErrorMessage(null);
    }
  }, [pet, isOpen, reset]);

  const onSubmit = async (values: EditPetFormValues) => {
    if (!pet) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await petsService.updatePet(pet.id, {
        name: values.name.trim(),
        species: values.species,
        breed: values.breed?.trim() || null,
        sex: values.sex,
        birthDate: values.birthDate ? new Date(values.birthDate) : null,
        isApproximateBirthDate: values.isApproximateBirthDate ?? false,
        color: values.color?.trim() || null,
        reproductiveStatus: values.reproductiveStatus,
        notes: values.notes?.trim() || null,
      });

      onPetUpdated(updated);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Error al actualizar los datos del paciente';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.modalContent} aria-describedby="edit-pet-desc">
        <DialogHeader>
          <DialogTitle>Editar Ficha del Paciente</DialogTitle>
          <DialogDescription id="edit-pet-desc">
            Modifique los datos clínicos y de filiación de la mascota.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className={styles.alertError} role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="pet-name" className={styles.label}>
                Nombre de la Mascota *
              </label>
              <Input
                id="pet-name"
                disabled={isSubmitting}
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              {errors.name && (
                <span className={styles.errorText} role="alert">
                  {errors.name.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="pet-species" className={styles.label}>
                Especie *
              </label>
              <select
                id="pet-species"
                className={styles.select}
                disabled={isSubmitting}
                {...register('species')}
              >
                <option value={PetSpecies.CANINE}>Canino (Perro)</option>
                <option value={PetSpecies.FELINE}>Felino (Gato)</option>
                <option value={PetSpecies.AVIAN}>Ave</option>
                <option value={PetSpecies.EQUINE}>Equino</option>
                <option value={PetSpecies.RODENT}>Roedor</option>
                <option value={PetSpecies.REPTILE}>Reptil</option>
                <option value={PetSpecies.OTHER}>Otro</option>
              </select>
              {errors.species && (
                <span className={styles.errorText} role="alert">
                  {errors.species.message}
                </span>
              )}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="pet-breed" className={styles.label}>
                Raza
              </label>
              <Input
                id="pet-breed"
                disabled={isSubmitting}
                aria-invalid={!!errors.breed}
                {...register('breed')}
              />
              {errors.breed && (
                <span className={styles.errorText} role="alert">
                  {errors.breed.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="pet-sex" className={styles.label}>
                Sexo *
              </label>
              <select
                id="pet-sex"
                className={styles.select}
                disabled={isSubmitting}
                {...register('sex')}
              >
                <option value={PetSex.MALE}>Macho</option>
                <option value={PetSex.FEMALE}>Hembra</option>
                <option value={PetSex.UNKNOWN}>Indeterminado</option>
              </select>
              {errors.sex && (
                <span className={styles.errorText} role="alert">
                  {errors.sex.message}
                </span>
              )}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="pet-birthdate" className={styles.label}>
                Fecha de Nacimiento
              </label>
              <Input
                id="pet-birthdate"
                type="date"
                disabled={isSubmitting}
                aria-invalid={!!errors.birthDate}
                {...register('birthDate')}
              />
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  disabled={isSubmitting}
                  {...register('isApproximateBirthDate')}
                />
                <span style={{ fontSize: 'var(--font-size-xs)' }}>Fecha aproximada</span>
              </label>
              {errors.birthDate && (
                <span className={styles.errorText} role="alert">
                  {errors.birthDate.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="pet-color" className={styles.label}>
                Color / Pelaje
              </label>
              <Input
                id="pet-color"
                disabled={isSubmitting}
                aria-invalid={!!errors.color}
                {...register('color')}
              />
              {errors.color && (
                <span className={styles.errorText} role="alert">
                  {errors.color.message}
                </span>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="pet-reproductive" className={styles.label}>
              Estado Reproductivo
            </label>
            <select
              id="pet-reproductive"
              className={styles.select}
              disabled={isSubmitting}
              {...register('reproductiveStatus')}
            >
              <option value={ReproductiveStatus.INTACT}>Entero / Intacto</option>
              <option value={ReproductiveStatus.NEUTERED}>Castrado</option>
              <option value={ReproductiveStatus.SPAYED}>Esterilizada</option>
              <option value={ReproductiveStatus.UNKNOWN}>No especificado</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="pet-notes" className={styles.label}>
              Observaciones / Señas Particulares
            </label>
            <textarea
              id="pet-notes"
              className={styles.textarea}
              disabled={isSubmitting}
              {...register('notes')}
            />
          </div>

          <div className={styles.footer}>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
