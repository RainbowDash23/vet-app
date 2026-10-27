import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@vet-app/shared-types';
import { Button, Input } from '../components/ui';
import {
  UsersIcon,
  PlusIcon,
  WarningIcon,
  CheckIcon,
  LockIcon,
} from '../components/ui/icons';
import { useAuth } from '../context/auth.context';
import { ApiError } from '../services/api.client';
import {
  usersService as defaultUsersService,
  UsersService,
  UserItem,
} from '../services/users.service';
import styles from './users-screen.module.css';

export const userFormSchema = z
  .object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Ingresa un correo electrónico válido'),
    password: z.string().min(6, 'La contraseña debe contener al menos 6 caracteres'),
    role: z.nativeEnum(Role, {
      errorMap: () => ({ message: 'Selecciona un rol válido (ADMIN, VET o RECEPTION)' }),
    }),
    licenseNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === Role.VET) {
      if (!data.licenseNumber || data.licenseNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La cédula profesional (licenseNumber) es obligatoria para el rol VET',
          path: ['licenseNumber'],
        });
      }
    }
  });

export type UserFormValues = z.infer<typeof userFormSchema>;

export interface UsersScreenProps {
  usersServiceInstance?: UsersService;
  initialUsers?: UserItem[];
  currentUserRole?: Role;
}

export const UsersScreen: React.FC<UsersScreenProps> = ({
  usersServiceInstance = defaultUsersService,
  initialUsers,
  currentUserRole: propRole,
}) => {
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const role = propRole ?? authContext?.role ?? null;
  const isAdmin = role === Role.ADMIN;

  const [users, setUsers] = useState<UserItem[]>(initialUsers ?? []);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: Role.VET,
      licenseNumber: '',
    },
  });

  const isMountedRef = useRef(true);
  useEffect(() => {

    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const selectedRole = watch('role');

  const loadUsers = async (isCancelled?: () => boolean) => {
    if (!isAdmin) return;
    setIsLoadingUsers(true);
    try {
      const list = await usersServiceInstance.getUsers();
      if (Array.isArray(list)) {
        if (!isMountedRef.current || (isCancelled && isCancelled())) return;
        setUsers(list);
      }
    } catch {
      // Si no se pueden cargar los usuarios, se ignora o se mantiene la lista vacía
    } finally {
      if (isMountedRef.current && !(isCancelled && isCancelled())) {
        setIsLoadingUsers(false);
      }
    }
  };

  useEffect(() => {

    let cancelled = false;
    if (!initialUsers && isAdmin) {
      void loadUsers(() => cancelled);
    }
    return () => {
      cancelled = true;
    };
  }, [isAdmin, initialUsers]);

  const onSubmit = async (values: UserFormValues) => {
    setApiError(null);
    setSuccessMessage(null);

    try {
      const created = await usersServiceInstance.createUser({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        role: values.role,
        licenseNumber: values.role === Role.VET ? values.licenseNumber?.trim() : null,
      });

      setSuccessMessage(`Usuario "${created.name}" creado exitosamente`);
      reset({
        name: '',
        email: '',
        password: '',
        role: Role.VET,
        licenseNumber: '',
      });

      void loadUsers();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setApiError('Este correo ya está registrado');
          return;
        }
        if (err.status === 400) {
          setApiError('Datos de usuario inválidos. Verifica los campos obligatorios.');
          return;
        }
        if (err.status === 403) {
          setApiError('No tienes permisos para registrar nuevos usuarios.');
          return;
        }
        setApiError(err.message || 'Error al comunicarse con el servidor');
      } else if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        setApiError('No se pudo conectar con el servidor');
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('Error inesperado al crear el usuario');
      }
    }
  };

  if (!isAdmin) {
    return (
      <div className={styles.container} role="main">
        <div className={styles.card}>
          <div className={`${styles.alertBox} ${styles.alertRestricted}`} role="alert">
            <LockIcon size={24} aria-hidden="true" />
            <div>
              <h2 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                Acceso Restringido
              </h2>
              <p style={{ margin: 0 }}>
                La gestión y creación de usuarios requiere credenciales de Administrador (ADMIN).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} role="main">
      <div className={styles.header}>
        <h1 className={styles.title}>Gestión de Usuarios</h1>
        <p className={styles.subtitle}>
          Administración de colaboradores clínicos, credenciales de acceso y asignación de roles.
        </p>
      </div>

      <div className={styles.layoutGrid}>
        {/* Formulario de creación de usuario */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <PlusIcon size={16} aria-hidden="true" />
            <span>Crear Nuevo Usuario</span>
          </h2>

          {apiError && (
            <div role="alert" aria-live="assertive" className={`${styles.alertBox} ${styles.alertError}`}>
              <WarningIcon size={16} aria-hidden="true" />
              <span>{apiError}</span>
            </div>
          )}

          {successMessage && (
            <div role="status" aria-live="polite" className={`${styles.alertBox} ${styles.alertSuccess}`}>
              <CheckIcon size={16} aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
            <Input
              id="user-name"
              label="Nombre Completo"
              placeholder="Ej: Dra. Andrea Castro"
              required
              disabled={isSubmitting}
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              id="user-email"
              label="Correo Electrónico"
              type="email"
              placeholder="andrea@vetcentral.com"
              required
              disabled={isSubmitting}
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              id="user-password"
              label="Contraseña Temporal"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              disabled={isSubmitting}
              error={errors.password?.message}
              {...register('password')}
            />

            <div className={styles.fieldGroup}>
              <label htmlFor="user-role" className={styles.label}>
                Rol Asignado *
              </label>
              <select
                id="user-role"
                className={styles.select}
                disabled={isSubmitting}
                {...register('role')}
              >
                <option value={Role.VET}>Veterinario (VET)</option>
                <option value={Role.RECEPTION}>Recepcionista (RECEPTIONIST)</option>
                <option value={Role.ADMIN}>Administrador (ADMIN)</option>
              </select>
              {errors.role?.message && (
                <span className={styles.fieldError} role="alert">
                  {errors.role.message}
                </span>
              )}
            </div>

            {selectedRole === Role.VET && (
              <Input
                id="user-license"
                label="Cédula / Licencia Profesional *"
                placeholder="Ej: MP-98234"
                required
                disabled={isSubmitting}
                error={errors.licenseNumber?.message}
                {...register('licenseNumber')}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
              className={styles.submitBtn}
            >
              Registrar Usuario
            </Button>
          </form>
        </div>

        {/* Tabla de colaboradores de la clínica */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <UsersIcon size={16} aria-hidden="true" />
            <span>Colaboradores de la Clínica ({users.length})</span>
          </h2>

          {isLoadingUsers ? (
            <p className={styles.emptyUsers}>Cargando lista de usuarios...</p>
          ) : users.length === 0 ? (
            <p className={styles.emptyUsers}>No hay otros usuarios registrados en la clínica.</p>
          ) : (
            <table className={styles.usersTable}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Cédula</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  let roleClass = styles.roleAdmin;
                  if (u.role === Role.VET) roleClass = styles.roleVet;
                  if (u.role === Role.RECEPTION) roleClass = styles.roleReception;

                  return (
                    <tr key={u.id}>
                      <td className={styles.userNameCol}>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`${styles.roleBadge} ${roleClass}`}>{u.role}</span>
                      </td>
                      <td>{u.licenseNumber || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
