import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { OwnerResponseDto } from '@vet-app/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from '../ui';
import { ownersService as defaultOwnersService, OwnersService } from '../../services/owners.service';
import { ApiError } from '../../services/api.client';
import styles from './edit-owner-modal.module.css';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const editOwnerSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe contener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  lastName: z
    .string()
    .min(2, 'El apellido debe contener al menos 2 caracteres')
    .max(100, 'El apellido no puede exceder 100 caracteres'),
  phone: z
    .string()
    .regex(
      E164_REGEX,
      'El teléfono debe cumplir con el formato internacional E.164 (ej. +593987654321)',
    ),
  email: z
    .string()
    .email('El correo electrónico no tiene un formato válido')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .max(250, 'La dirección no puede exceder 250 caracteres')
    .optional()
    .or(z.literal('')),
});

export type EditOwnerFormValues = z.infer<typeof editOwnerSchema>;

export interface EditOwnerModalProps {
  isOpen: boolean;
  owner: OwnerResponseDto | null;
  onClose: () => void;
  onOwnerUpdated: (updated: OwnerResponseDto) => void;
  ownersService?: OwnersService;
}

export const EditOwnerModal: React.FC<EditOwnerModalProps> = ({
  isOpen,
  owner,
  onClose,
  onOwnerUpdated,
  ownersService = defaultOwnersService,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditOwnerFormValues>({
    resolver: zodResolver(editOwnerSchema),
    defaultValues: {
      name: owner?.name ?? '',
      lastName: owner?.lastName ?? '',
      phone: owner?.phone ?? '',
      email: owner?.email ?? '',
      address: owner?.address ?? '',
    },
  });

  useEffect(() => {
    if (owner && isOpen) {
      reset({
        name: owner.name ?? '',
        lastName: owner.lastName ?? '',
        phone: owner.phone ?? '',
        email: owner.email ?? '',
        address: owner.address ?? '',
      });
      setErrorMessage(null);
    }
  }, [owner, isOpen, reset]);

  const onSubmit = async (values: EditOwnerFormValues) => {
    if (!owner) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await ownersService.updateOwner(owner.id, {
        name: values.name.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        email: values.email?.trim() || null,
        address: values.address?.trim() || null,
      });

      onOwnerUpdated(updated);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Error al actualizar los datos del propietario';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.modalContent} aria-describedby="edit-owner-desc">
        <DialogHeader>
          <DialogTitle>Editar Datos del Propietario</DialogTitle>
          <DialogDescription id="edit-owner-desc">
            Actualice los datos de filiación y contacto del dueño responsable.
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
              <label htmlFor="owner-name" className={styles.label}>
                Nombre *
              </label>
              <Input
                id="owner-name"
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
              <label htmlFor="owner-lastname" className={styles.label}>
                Apellido *
              </label>
              <Input
                id="owner-lastname"
                disabled={isSubmitting}
                aria-invalid={!!errors.lastName}
                {...register('lastName')}
              />
              {errors.lastName && (
                <span className={styles.errorText} role="alert">
                  {errors.lastName.message}
                </span>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="owner-phone" className={styles.label}>
              Teléfono (Formato E.164) *
            </label>
            <Input
              id="owner-phone"
              type="tel"
              placeholder="+593987654321"
              disabled={isSubmitting}
              aria-invalid={!!errors.phone}
              {...register('phone')}
            />
            <span className={styles.hint}>
              Debe comenzar con '+' seguido del código de país y el número local.
            </span>
            {errors.phone && (
              <span className={styles.errorText} role="alert">
                {errors.phone.message}
              </span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="owner-email" className={styles.label}>
              Correo Electrónico
            </label>
            <Input
              id="owner-email"
              type="email"
              placeholder="propietario@ejemplo.com"
              disabled={isSubmitting}
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <span className={styles.errorText} role="alert">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="owner-address" className={styles.label}>
              Dirección
            </label>
            <Input
              id="owner-address"
              disabled={isSubmitting}
              aria-invalid={!!errors.address}
              {...register('address')}
            />
            {errors.address && (
              <span className={styles.errorText} role="alert">
                {errors.address.message}
              </span>
            )}
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
