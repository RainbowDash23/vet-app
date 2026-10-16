import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '../components/forms/FormField';
import { fakeTagReader } from '../readers/fake-tag-reader';
import styles from './PetRegisterScreen.module.css';

const petSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  species: z.string().min(2, 'Indica la especie de la mascota'),
  breed: z.string().optional(),
  nfcUid: z.string().min(8, 'El UID del llavero NFC debe tener al menos 8 caracteres'),
});

type PetFormValues = z.infer<typeof petSchema>;

export const PetRegisterScreen: React.FC = () => {
  const { control, handleSubmit, setValue } = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    defaultValues: {
      name: '',
      species: '',
      breed: '',
      nfcUid: '',
    },
  });

  // Al detectar un llavero NFC en el simulador o hardware, autocompletar el campo nfcUid
  useEffect(() => {
    const unsubscribe = fakeTagReader.onTag((uid) => {
      setValue('nfcUid', uid, { shouldValidate: true });
    });
    return () => unsubscribe();
  }, [setValue]);

  const onSubmit = (data: PetFormValues) => {
    console.log('[PetRegisterScreen] Mascota a registrar (mock):', data);
    alert(`[Mock Registro] Mascota: ${data.name} vinculada al tag NFC: ${data.nfcUid}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Registrar Nueva Mascota</h1>
        <p className={styles.subtitle}>
          Completa los datos del paciente y vincula el llavero NFC
        </p>
      </div>

      <div className={styles.card}>
        <form onSubmit={handleSubmit(onSubmit)}>
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
              placeholder="Canino, Felino, etc."
              icon="🏷️"
            />
            <FormField
              control={control}
              name="breed"
              label="Raza (Opcional)"
              placeholder="Ej: Golden Retriever"
              icon="🧬"
            />
          </div>

          <FormField
            control={control}
            name="nfcUid"
            label="UID del Llavero NFC"
            placeholder="Escanea el llavero o pulsa el simulador..."
            icon="📡"
            description="Puedes ingresar el código manualmente o acercar el llavero al lector / presionar el botón simulador."
          />

          <button type="submit" className={styles.submitBtn}>
            Guardar Registro
          </button>
        </form>
      </div>
    </div>
  );
};
