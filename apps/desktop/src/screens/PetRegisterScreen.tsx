import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PetSpecies, PetSex, ReproductiveStatus } from '@vet-app/shared-types';
import type { PetResponseDto, OwnerResponseDto } from '@vet-app/shared-types';
import { FormField, FormFieldType } from '../components/forms/FormField';
import { petsService } from '../services/pets.service';
import { ownersService } from '../services/owners.service';
import { ApiError } from '../services/api.client';
import { fakeTagReader } from '../readers/fake-tag-reader';
import styles from './PetRegisterScreen.module.css';

const petSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  species: z.nativeEnum(PetSpecies, { errorMap: () => ({ message: 'Seleccione una especie válida' }) }),
  breed: z.string().optional().or(z.literal('')),
  sex: z.nativeEnum(PetSex).optional().default(PetSex.UNKNOWN),
  color: z.string().optional().or(z.literal('')),
  ownerId: z.string().min(1, 'Debe seleccionar un propietario para la mascota'),
  nfcUid: z.string().optional().refine((val) => !val || val.length >= 8, {
    message: 'El UID del llavero NFC debe tener al menos 8 caracteres',
  }),
});

type PetFormValues = z.infer<typeof petSchema>;

export interface PetRegisterScreenProps {
  initialOwnerId?: string;
  initialNfcUid?: string;
  onPetCreated?: (pet: PetResponseDto) => void;
  onNavigateToOwnerRegister?: () => void;
  onNavigateToPetFile?: (petId: string) => void;
}

export const PetRegisterScreen: React.FC<PetRegisterScreenProps> = ({
  initialOwnerId,
  initialNfcUid,
  onPetCreated,
  onNavigateToOwnerRegister,
  onNavigateToPetFile,
}) => {
  const [owners, setOwners] = useState<OwnerResponseDto[]>([]);
  const [isLoadingOwners, setIsLoadingOwners] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [tagWarningMessage, setTagWarningMessage] = useState<string | null>(null);
  const [createdPet, setCreatedPet] = useState<PetResponseDto | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    reset,
  } = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    defaultValues: {
      name: '',
      species: PetSpecies.CANINE,
      breed: '',
      sex: PetSex.UNKNOWN,
      color: '',
      ownerId: initialOwnerId ?? '',
      nfcUid: initialNfcUid ?? '',
    },
  });

  // Cargar propietarios vinculados a la clínica activa
  useEffect(() => {
    let mounted = true;
    setIsLoadingOwners(true);

    ownersService
      .getOwners({ limit: 100 })
      .then((res) => {
        if (mounted && res?.data) {
          setOwners(res.data);
          if (initialOwnerId) {
            setValue('ownerId', initialOwnerId);
          } else if (res.data.length > 0) {
            setValue('ownerId', res.data[0].id);
          }
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          const msg = err instanceof ApiError ? err.message : 'Error al cargar la lista de propietarios';
          setApiErrorMessage(msg);
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingOwners(false);
      });

    return () => {
      mounted = false;
    };
  }, [initialOwnerId, setValue]);

  // Actualizar nfcUid si cambia initialNfcUid
  useEffect(() => {
    if (initialNfcUid) {
      setValue('nfcUid', initialNfcUid);
    }
  }, [initialNfcUid, setValue]);

  // Suscripción al lector de tags (tanto simulador como eventos nativos de hardware)
  useEffect(() => {
    const unsubSim = fakeTagReader.onTag((uid) => {
      setValue('nfcUid', uid, { shouldValidate: true });
    });

    let unsubElectron: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onTagDetected) {
      unsubElectron = window.electronAPI.onTagDetected((uid) => {
        setValue('nfcUid', uid, { shouldValidate: true });
      });
    }

    return () => {
      unsubSim();
      unsubElectron?.();
    };
  }, [setValue]);

  const onSubmit = async (data: PetFormValues) => {
    setIsSubmitting(true);
    setApiErrorMessage(null);
    setTagWarningMessage(null);

    try {
      // 1. Crear la mascota con POST /pets (RF-17, RF-69)
      const newPet = await petsService.createPet({
        name: data.name.trim(),
        species: data.species,
        breed: data.breed?.trim() || null,
        sex: data.sex,
        color: data.color?.trim() || null,
        ownerId: data.ownerId,
        reproductiveStatus: ReproductiveStatus.INTACT,
      });

      // 2. Si se suministró un llavero NFC, asignarlo con POST /tags/assign (RF-30, RF-69)
      const cleanUid = data.nfcUid?.trim();
      if (cleanUid && cleanUid.length >= 8) {
        try {
          await petsService.assignTag({
            uid: cleanUid,
            petId: newPet.id,
          });
        } catch (tagErr: unknown) {
          if (tagErr instanceof ApiError) {
            if (tagErr.status === 409) {
              setTagWarningMessage('Mascota creada, pero no se pudo asociar el llavero: El tag ya se encuentra asignado a otro paciente o la mascota ya posee un llavero activo.');
            } else if (tagErr.status === 403) {
              setTagWarningMessage('Mascota creada, pero su rol no tiene permisos para asociar llaveros NFC.');
            } else if (tagErr.status === 404) {
              setTagWarningMessage('Mascota creada, pero el tag o la clínica no fueron encontrados.');
            } else {
              setTagWarningMessage(`Mascota creada, pero falló la asignación del llavero: ${tagErr.message}`);
            }
          } else {
            setTagWarningMessage('Mascota creada, pero ocurrió un error de red al asignar el llavero.');
          }
        }
      }

      setCreatedPet(newPet);
      onPetCreated?.(newPet);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setApiErrorMessage('No se encontró el propietario seleccionado o no pertenece a esta clínica.');
        } else if (err.status === 409) {
          setApiErrorMessage('Conflicto: Ya existe un registro coincidente.');
        } else if (err.status === 429) {
          setApiErrorMessage('Límite de solicitudes superado. Espere un momento antes de volver a intentar.');
        } else if (err.status === 403) {
          setApiErrorMessage('Acceso denegado: Su rol no permite registrar pacientes.');
        } else {
          setApiErrorMessage(err.message || 'Error al registrar la mascota.');
        }
      } else {
        setApiErrorMessage('Error de conexión al registrar la mascota.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    reset({
      name: '',
      species: PetSpecies.CANINE,
      breed: '',
      sex: PetSex.UNKNOWN,
      color: '',
      ownerId: owners[0]?.id ?? '',
      nfcUid: '',
    });
    setCreatedPet(null);
    setApiErrorMessage(null);
    setTagWarningMessage(null);
  };

  if (createdPet) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Mascota Registrada</h1>
          <p className={styles.subtitle}>El paciente ha sido dado de alta exitosamente en la clínica.</p>
        </div>

        <div className={styles.card}>
          <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
            <strong>✅ Paciente Registrado con Éxito</strong>
            <p>
              Nombre: <strong>{createdPet.name}</strong> ({createdPet.species})
            </p>
            {createdPet.breed && <p>Raza: {createdPet.breed}</p>}
          </div>

          {tagWarningMessage && (
            <div className={`${styles.alertBox} ${styles.alertWarning}`} role="alert">
              <strong>⚠️ Aviso sobre el llavero NFC:</strong>
              <p>{tagWarningMessage}</p>
            </div>
          )}

          <div className={styles.successActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => onNavigateToPetFile?.(createdPet.id)}
            >
              🩺 Ver Ficha Clínica
            </button>
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={handleResetForm}
            >
              Registrar Otra Mascota
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Registrar Nueva Mascota</h1>
        <p className={styles.subtitle}>
          Completa los datos del paciente y vincula el llavero NFC (RF-69).
        </p>
      </div>

      <div className={styles.card}>
        {apiErrorMessage && (
          <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
            <strong>⚠️ Error:</strong>
            <p>{apiErrorMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Selector de propietario */}
          <div className={styles.ownerSelectionGroup}>
            <div className={styles.ownerHeaderRow}>
              <label htmlFor="ownerSelect" className={styles.ownerLabel}>
                Propietario / Titular
              </label>
              {onNavigateToOwnerRegister && (
                <button
                  type="button"
                  className={styles.newOwnerLink}
                  onClick={onNavigateToOwnerRegister}
                >
                  + Dar de alta nuevo dueño
                </button>
              )}
            </div>

            <FormField
              control={control}
              name="ownerId"
              fieldType={FormFieldType.SELECT}
              disabled={isLoadingOwners || owners.length === 0}
            >
              {owners.length === 0 ? (
                <option value="">No hay propietarios registrados</option>
              ) : (
                owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} {o.lastName} (C.I. {o.documentId}) - {o.phone}
                  </option>
                ))
              )}
            </FormField>
          </div>

          <FormField
            control={control}
            name="name"
            label="Nombre de la Mascota"
            placeholder="Ej: Max, Luna..."
            icon="🐾"
          />

          <div className={styles.row}>
            <FormField
              control={control}
              name="species"
              label="Especie"
              fieldType={FormFieldType.SELECT}
              icon="🏷️"
            >
              <option value={PetSpecies.CANINE}>Canino (Perro)</option>
              <option value={PetSpecies.FELINE}>Felino (Gato)</option>
              <option value={PetSpecies.OTHER}>Otra Especie</option>
            </FormField>

            <FormField
              control={control}
              name="breed"
              label="Raza (Opcional)"
              placeholder="Ej: Golden Retriever"
              icon="🧬"
            />
          </div>

          <div className={styles.row}>
            <FormField
              control={control}
              name="sex"
              label="Sexo"
              fieldType={FormFieldType.SELECT}
              icon="⚧"
            >
              <option value={PetSex.MALE}>Macho</option>
              <option value={PetSex.FEMALE}>Hembra</option>
              <option value={PetSex.UNKNOWN}>Desconocido / No especificado</option>
            </FormField>

            <FormField
              control={control}
              name="color"
              label="Color / Manto (Opcional)"
              placeholder="Ej: Dorado, Manchas negras"
              icon="🎨"
            />
          </div>

          <FormField
            control={control}
            name="nfcUid"
            label="UID del Llavero NFC"
            placeholder="Escanee el llavero o pulse simular..."
            icon="📡"
            description="Acerca el llavero al lector serial USB o ingresa el UID manualmente."
          />

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isSubmitting || isLoadingOwners}
          >
            {isSubmitting ? 'Guardando Registro...' : 'Guardar Registro'}
          </button>
        </form>
      </div>
    </div>
  );
};
