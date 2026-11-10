import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, ClinicResponseDto } from '@vet-app/shared-types';
import { Button, Input } from '../components/ui';
import { LockIcon, CheckIcon, WarningIcon } from '../components/ui/icons';
import { useAuth } from '../context/auth.context';
import { ApiError } from '../services/api.client';
import {
  clinicsService as defaultClinicsService,
  ClinicsService,
} from '../services/clinics.service';
import styles from './clinic-management-screen.module.css';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

export const clinicFormSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre de la clínica debe contener al menos 2 caracteres')
    .max(100, 'El nombre de la clínica no puede exceder 100 caracteres'),
  phone: z
    .string()
    .min(1, 'El número telefónico institucional es obligatorio')
    .regex(
      E164_PHONE_REGEX,
      'El teléfono debe cumplir con el formato internacional E.164 (ej. +573001234567 o +593987654321)',
    ),
  address: z
    .string()
    .max(250, 'La dirección no puede exceder 250 caracteres')
    .optional(),
});

export type ClinicFormValues = z.infer<typeof clinicFormSchema>;

export interface ClinicManagementScreenProps {
  clinicsServiceInstance?: ClinicsService;
  currentUserRole?: Role;
  initialClinic?: ClinicResponseDto;
  onClinicUpdated?: (clinic: ClinicResponseDto) => void;
}

export const ClinicManagementScreen: React.FC<ClinicManagementScreenProps> = ({
  clinicsServiceInstance = defaultClinicsService,
  currentUserRole: propRole,
  initialClinic,
  onClinicUpdated,
}) => {
  let authRole: Role | undefined;
  try {
    const auth = useAuth();
    authRole = auth.role ?? undefined;
  } catch {
    // Context no disponible en pruebas unitarias aisladas
  }

  const role = propRole ?? authRole;
  const isAdmin = role === Role.ADMIN;

  const [clinic, setClinic] = useState<ClinicResponseDto | null>(initialClinic ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialClinic);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ClinicFormValues>({
    resolver: zodResolver(clinicFormSchema),
    defaultValues: {
      name: initialClinic?.name ?? '',
      phone: initialClinic?.phone ?? '',
      address: initialClinic?.address ?? '',
    },
  });

  useEffect(() => {
    if (initialClinic) {
      setClinic(initialClinic);
      reset({
        name: initialClinic.name ?? '',
        phone: initialClinic.phone ?? '',
        address: initialClinic.address ?? '',
      });
      setIsLoading(false);
      return;
    }

    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    clinicsServiceInstance
      .getCurrentClinic()
      .then((data) => {
        if (!isMounted) return;
        setClinic(data);
        reset({
          name: data.name ?? '',
          phone: data.phone ?? '',
          address: data.address ?? '',
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : 'No se pudo cargar la información institucional de la clínica';
        setErrorMessage(msg);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [clinicsServiceInstance, isAdmin, initialClinic, reset]);

  const onSubmit = async (values: ClinicFormValues) => {
    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const updated = await clinicsServiceInstance.updateCurrentClinic({
        name: values.name.trim(),
        phone: values.phone.trim(),
        address: values.address?.trim() || null,
      });

      setClinic(updated);
      reset({
        name: updated.name ?? '',
        phone: updated.phone ?? '',
        address: updated.address ?? '',
      });
      setSuccessMessage('Datos de la clínica actualizados exitosamente');
      onClinicUpdated?.(updated);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Ocurrió un error al actualizar los datos de la clínica';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.unauthorizedBox} role="alert">
          <LockIcon size={40} />
          <h2 className={styles.unauthorizedTitle}>Acceso Restringido</h2>
          <p className={styles.unauthorizedMessage}>
            La configuración institucional de la clínica está reservada exclusivamente para usuarios
            con rol Administrador (ADMIN).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Datos de la Clínica</h1>
        <p className={styles.subtitle}>
          Configuración institucional y de contacto para el portal público de auxilio y fichas médicas.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Información Institucional</h2>

        <div className={styles.infoBanner}>
          <strong>Importante:</strong> El teléfono y la dirección configurados aquí se muestran a
          quien encuentre una mascota extraviada en el portal de auxilio (
          <code>/p/:publicCode</code>). El teléfono debe incluir el código de país (ej. +57, +593)
          para permitir llamadas de emergencia y enlace directo con WhatsApp.
        </div>

        {errorMessage && (
          <div className={`${styles.globalAlert} ${styles.globalAlertError}`} role="alert">
            <WarningIcon size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className={`${styles.globalAlert} ${styles.globalAlertSuccess}`} role="status">
            <CheckIcon size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {isLoading ? (
          <p>Cargando información de la clínica...</p>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className={styles.formGroup}>
              <label htmlFor="clinic-code" className={styles.label}>
                Código Identificador (No editable)
              </label>
              <div id="clinic-code" className={styles.readOnlyValue}>
                {clinic?.code || '—'}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinic-name" className={styles.label}>
                Nombre Comercial de la Clínica *
              </label>
              <Input
                id="clinic-name"
                type="text"
                disabled={isSubmitting}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'clinic-name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <span id="clinic-name-error" className={styles.errorText} role="alert">
                  {errors.name.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinic-phone" className={styles.label}>
                Teléfono de Emergencia y Contacto (Formato E.164) *
              </label>
              <Input
                id="clinic-phone"
                type="tel"
                placeholder="+573001234567"
                disabled={isSubmitting}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? 'clinic-phone-error' : undefined}
                {...register('phone')}
              />
              <span className={styles.labelHint}>
                Debe comenzar con '+' seguido del código de país y el número local sin espacios ni guiones.
              </span>
              {errors.phone && (
                <span id="clinic-phone-error" className={styles.errorText} role="alert">
                  {errors.phone.message}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinic-address" className={styles.label}>
                Dirección Física de la Clínica
              </label>
              <Input
                id="clinic-address"
                type="text"
                placeholder="Av. Principal #12-34, Local 2"
                disabled={isSubmitting}
                aria-invalid={!!errors.address}
                aria-describedby={errors.address ? 'clinic-address-error' : undefined}
                {...register('address')}
              />
              {errors.address && (
                <span id="clinic-address-error" className={styles.errorText} role="alert">
                  {errors.address.message}
                </span>
              )}
            </div>

            <div className={styles.buttonRow}>
              <Button type="submit" disabled={isSubmitting} variant="primary">
                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
