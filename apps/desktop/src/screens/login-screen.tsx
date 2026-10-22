import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '../components/ui';
import { WarningIcon } from '../components/ui/icons';
import { ApiError } from '../services/api.client';
import { useAuth } from '../context/auth.context';
import styles from './login-screen.module.css';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo electrónico es obligatorio')
    .email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria')
    .min(6, 'La contraseña debe contener al menos 6 caracteres'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface LoginScreenProps {
  onSuccess?: () => void;
  errorMessage?: string;
  isLoading?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSuccess,
  errorMessage: propErrorMessage,
  isLoading: propIsLoading,
}) => {
  // Soporte seguro en caso de renderizado aislado
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const isFormLoading = Boolean(
    propIsLoading || isSubmitting || authContext?.isLoading,
  );

  const activeErrorMessage =
    propErrorMessage || formError || authContext?.error || null;

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    authContext?.clearError?.();

    try {
      if (authContext) {
        await authContext.login(values.email, values.password);
      }
      onSuccess?.();
    } catch (err: unknown) {
      let message = 'Credenciales inválidas';
      if (err instanceof ApiError) {
        if (err.status === 401) {
          message = 'Credenciales inválidas';
        } else {
          message = err.message || 'Error al comunicarse con el servidor';
        }
      } else if (err instanceof TypeError || (err instanceof Error && (err.message.includes('fetch') || err.message.includes('connect')))) {
        message = 'No se pudo conectar con el servidor';
      } else if (err instanceof Error) {
        message = err.message;
      }
      setFormError(message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Iniciar Sesión</h1>
        <p className={styles.subtitle}>
          Acceso para personal de la clínica
        </p>
      </div>

      {activeErrorMessage && (
        <div role="alert" aria-live="assertive" className={styles.errorAlert}>
          <span className={styles.errorIcon} aria-hidden="true">
            <WarningIcon size={16} />
          </span>
          <span>{activeErrorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
        <Input
          id="login-email"
          label="Correo Electrónico"
          type="email"
          autoComplete="email"
          placeholder="ejemplo@vetapp.com"
          required
          disabled={isFormLoading}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          id="login-password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          disabled={isFormLoading}
          error={errors.password?.message}
          {...register('password')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isFormLoading}
          className={styles.submitButton}
        >
          Ingresar al Sistema
        </Button>
      </form>
    </div>
  );
};
