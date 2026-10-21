import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { OwnerResponseDto } from '@vet-app/shared-types';
import { FormField } from '../components/forms/FormField';
import { ownersService as defaultOwnersService, OwnersService } from '../services/owners.service';
import { ApiError } from '../services/api.client';
import { useSafeDirtyGuard } from '../hooks/use-form-dirty-guard';
import styles from './OwnerRegisterScreen.module.css';

const ownerSchema = z.object({
  documentId: z.string().min(3, 'El documento debe tener al menos 3 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().min(2, 'Los apellidos deben tener al menos 2 caracteres'),
  phone: z.string().min(7, 'El teléfono debe tener al menos 7 dígitos'),
  email: z.string().email('Correo electrónico inválido').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});

type OwnerFormValues = z.infer<typeof ownerSchema>;

export interface OwnerRegisterScreenProps {
  onOwnerCreated?: (owner: OwnerResponseDto) => void;
  onNavigateToPetRegister?: (ownerId?: string) => void;
  ownersServiceInstance?: OwnersService;
}

export const OwnerRegisterScreen: React.FC<OwnerRegisterScreenProps> = ({
  onOwnerCreated,
  onNavigateToPetRegister,
  ownersServiceInstance = defaultOwnersService,
}) => {
  const [isCheckingLookup, setIsCheckingLookup] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    checked: boolean;
    exists: boolean;
    message?: string;
  }>({ checked: false, exists: false });
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [createdOwner, setCreatedOwner] = useState<OwnerResponseDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty },
  } = useForm<OwnerFormValues>({
    resolver: zodResolver(ownerSchema),
    defaultValues: {
      documentId: '',
      name: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
    },
  });

  const safeDirtyGuard = useSafeDirtyGuard();
  React.useEffect(() => {
    safeDirtyGuard?.setIsDirty(isDirty);
    return () => {
      safeDirtyGuard?.setIsDirty(false);
    };
  }, [safeDirtyGuard, isDirty]);

  const documentIdValue = watch('documentId');

  const handleLookup = async () => {
    const docId = (documentIdValue || '').trim();
    if (!docId || docId.length < 3) {
      setApiErrorMessage('Ingrese un documento de identidad válido de al menos 3 caracteres para verificar.');
      return;
    }

    setIsCheckingLookup(true);
    setApiErrorMessage(null);
    setLookupResult({ checked: false, exists: false });

    try {
      const res = await ownersServiceInstance.lookup(docId);
      if (res.exists) {
        setLookupResult({
          checked: true,
          exists: true,
          message:
            `El titular con documento "${docId}" ya se encuentra registrado en la red veterinaria. Para vincular su ficha a esta clínica y acceder a su historial con consentimiento, debe escanear el llavero NFC de una de sus mascotas. No es posible crear un registro duplicado.`,
        });
      } else {
        setLookupResult({
          checked: true,
          exists: false,
          message: 'Documento disponible. Puede completar los datos para dar de alta al titular.',
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setApiErrorMessage('Límite de consultas superado (máximo 10 intentos por minuto). Por favor, espere un momento antes de volver a consultar.');
        } else if (err.status === 403) {
          setApiErrorMessage('Acceso denegado: Su rol no tiene permisos para realizar búsquedas o registros de propietarios.');
        } else {
          setApiErrorMessage(err.message || 'Error al verificar el documento.');
        }
      } else {
        setApiErrorMessage('Error de red al consultar el documento del propietario.');
      }
    } finally {
      setIsCheckingLookup(false);
    }
  };

  const onSubmit = async (data: OwnerFormValues) => {
    // Bloquear si la verificación previa detectó existencia
    if (lookupResult.exists) {
      setApiErrorMessage('No se puede dar de alta un titular duplicado. Debe vincularlo escaneando el llavero NFC de su mascota.');
      return;
    }

    setIsSubmitting(true);
    setApiErrorMessage(null);

    try {
      const created = await ownersServiceInstance.createOwner({
        documentId: data.documentId,
        name: data.name,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || null,
        address: data.address || null,
      });

      setCreatedOwner(created);
      onOwnerCreated?.(created);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setApiErrorMessage('Conflicto: Ya existe un propietario registrado con este documento de identidad.');
        } else if (err.status === 403) {
          setApiErrorMessage('Acceso denegado: Su rol no tiene permisos para dar de alta propietarios.');
        } else if (err.status === 404) {
          setApiErrorMessage('No se encontró el recurso o clínica especificada.');
        } else {
          setApiErrorMessage(err.message || 'Error al registrar el propietario.');
        }
      } else {
        setApiErrorMessage('Error de red al registrar el propietario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    reset({
      documentId: '',
      name: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
    });
    setLookupResult({ checked: false, exists: false });
    setApiErrorMessage(null);
    setCreatedOwner(null);
  };

  if (createdOwner) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Propietario Registrado</h1>
          <p className={styles.subtitle}>El titular ha sido dado de alta exitosamente en la clínica.</p>
        </div>

        <div className={styles.card}>
          <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
            <strong>✅ Registro Exitoso</strong>
            <p>
              Titular: <strong>{createdOwner.name} {createdOwner.lastName}</strong> (C.I. {createdOwner.documentId})
            </p>
            <p>Teléfono: {createdOwner.phone}</p>
          </div>

          <div className={styles.successActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => onNavigateToPetRegister?.(createdOwner.id)}
            >
              🐾 Registrar Mascota para este Titular
            </button>
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={handleResetForm}
            >
              Registrar Otro Propietario
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Alta de Propietario</h1>
        <p className={styles.subtitle}>
          Verifique primero el documento de identidad para evitar registros duplicados.
        </p>
      </div>

      <div className={styles.card}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.lookupSection}>
            <div className={styles.lookupInputGroup}>
              <FormField
                control={control}
                name="documentId"
                label="Documento de Identidad (Cédula / DNI)"
                placeholder="Ej: 12345678"
                icon="🪪"
                disabled={lookupResult.exists}
              />
            </div>
            <button
              type="button"
              className={styles.lookupButton}
              onClick={handleLookup}
              disabled={isCheckingLookup || !documentIdValue || documentIdValue.length < 3}
            >
              {isCheckingLookup ? 'Verificando...' : '🔍 Verificar'}
            </button>
          </div>

          {lookupResult.checked && lookupResult.exists && (
            <div className={`${styles.alertBox} ${styles.alertInfo}`} role="alert">
              <strong>ℹ️ Titular Existente en la Red</strong>
              <p>{lookupResult.message}</p>
            </div>
          )}

          {lookupResult.checked && !lookupResult.exists && (
            <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
              <p>✅ {lookupResult.message}</p>
            </div>
          )}

          {apiErrorMessage && (
            <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
              <strong>⚠️ Error</strong>
              <p>{apiErrorMessage}</p>
            </div>
          )}

          {/* Campos adicionales de alta, bloqueados si ya existe */}
          <div className={styles.row}>
            <FormField
              control={control}
              name="name"
              label="Nombre"
              placeholder="Ej: Laura"
              icon="👤"
              disabled={lookupResult.exists}
            />
            <FormField
              control={control}
              name="lastName"
              label="Apellidos"
              placeholder="Ej: Martínez Pérez"
              icon="👤"
              disabled={lookupResult.exists}
            />
          </div>

          <div className={styles.row}>
            <FormField
              control={control}
              name="phone"
              label="Teléfono de Contacto"
              placeholder="Ej: +584121234567"
              icon="📞"
              disabled={lookupResult.exists}
            />
            <FormField
              control={control}
              name="email"
              label="Correo Electrónico (Opcional)"
              placeholder="Ej: laura@ejemplo.com"
              type="email"
              icon="✉️"
              disabled={lookupResult.exists}
            />
          </div>

          <FormField
            control={control}
            name="address"
            label="Dirección de Habitación (Opcional)"
            placeholder="Ej: Av. Bolívar, Res. Los Olivos, Apto 4B"
            icon="🏠"
            disabled={lookupResult.exists}
          />

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isSubmitting || lookupResult.exists || !lookupResult.checked}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar Propietario'}
          </button>
        </form>
      </div>
    </div>
  );
};
