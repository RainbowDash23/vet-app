import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '../components/forms/FormField';
import styles from './LoginScreen.module.css';

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginScreen: React.FC = () => {
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    // Cascarón sin lógica real
    console.log('[LoginScreen] Datos enviados (mock):', data);
    alert(`[Mock Login] Intento de acceso para: ${data.email}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Iniciar Sesión</h1>
        <p className={styles.subtitle}>
          Ingresa con tus credenciales de la clínica (ADMIN, VET o RECEPCION)
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="email"
          label="Correo Electrónico"
          placeholder="ejemplo@vetapp.com"
          type="email"
          icon="✉️"
        />

        <FormField
          control={control}
          name="password"
          label="Contraseña"
          placeholder="••••••••"
          type="password"
          icon="🔒"
        />

        <button type="submit" className={styles.button}>
          Ingresar al Sistema
        </button>
      </form>

      <div className={styles.placeholderNote}>
        🔒 Cascarón visual sin conexión real a la API. Autenticación gestionada vía JWT por NestJS.
      </div>
    </div>
  );
};
