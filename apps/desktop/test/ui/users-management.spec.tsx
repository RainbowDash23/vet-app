import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersScreen } from '../../src/screens/users-screen';
import { AuthProvider } from '../../src/context/auth.context';
import { UsersService } from '../../src/services/users.service';
import { ApiError } from '../../src/services/api.client';
import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary } from '@vet-app/shared-types';

describe('UI Integration: Pantalla de Gestión de Usuarios (UsersScreen)', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;

  const adminUser: AuthUserSummary = {
    id: 'admin-uuid',
    email: 'admin@vetcentral.com',
    name: 'Dra. María González',
    role: Role.ADMIN,
    clinicId: 'clinic-uuid',
  };

  const vetUser: AuthUserSummary = {
    id: 'vet-uuid',
    email: 'vet@vetcentral.com',
    name: 'Dr. Roberto Santos',
    role: Role.VET,
    clinicId: 'clinic-uuid',
  };

  it('solo se renderiza si el usuario tiene rol ADMIN; de lo contrario muestra mensaje de acceso restringido', () => {
    const { container, rerender } = render(
      <AuthProvider initialUser={vetUser}>
        <UsersScreen currentUserRole={Role.VET} />
      </AuthProvider>
    );

    // Con rol VET debe denegar el acceso
    expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar usuario/i })).not.toBeInTheDocument();
    expect(emojiRegex.test(container.innerHTML)).toBe(false);

    // Con rol ADMIN debe permitir el acceso
    rerender(
      <AuthProvider initialUser={adminUser}>
        <UsersScreen currentUserRole={Role.ADMIN} initialUsers={[]} />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /gestión de usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar usuario/i })).toBeInTheDocument();
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('valida los campos con Zod y exige licenseNumber únicamente cuando el rol es VET', async () => {
    const user = userEvent.setup();
    const mockUsersService = {
      createUser: vi.fn(),
      getUsers: vi.fn().mockResolvedValue([]),
    } as unknown as UsersService;

    render(
      <AuthProvider initialUser={adminUser}>
        <UsersScreen usersServiceInstance={mockUsersService} currentUserRole={Role.ADMIN} />
      </AuthProvider>
    );

    // Al enviar el formulario vacío, Zod debe emitir errores descriptivos en español
    await user.click(screen.getByRole('button', { name: /registrar usuario/i }));

    await waitFor(() => {
      expect(screen.getByText(/el nombre debe tener al menos 2 caracteres/i)).toBeInTheDocument();
      expect(screen.getByText(/ingresa un correo electrónico válido/i)).toBeInTheDocument();
      expect(screen.getByText(/la contraseña debe contener al menos 6 caracteres/i)).toBeInTheDocument();
      expect(screen.getByText(/la cédula profesional.*es obligatoria para el rol VET/i)).toBeInTheDocument();
    });

    expect(mockUsersService.createUser).not.toHaveBeenCalled();

    // Cambiar el rol a RECEPTIONIST: el campo de cédula ya no debe ser requerido
    await user.selectOptions(screen.getByLabelText(/rol asignado/i), Role.RECEPTION);

    await waitFor(() => {
      expect(screen.queryByLabelText(/cédula \/ licencia profesional/i)).not.toBeInTheDocument();
    });
  });

  it('llama a POST /users con los datos validados y despliega confirmación de éxito', async () => {
    const user = userEvent.setup();
    const mockUsersService = {
      createUser: vi.fn().mockResolvedValue({
        id: 'new-user-1',
        clinicId: 'clinic-uuid',
        name: 'Dra. Andrea Castro',
        email: 'andrea@vetcentral.com',
        role: Role.VET,
        licenseNumber: 'MP-98234',
        specialty: null,
        phone: null,
        createdAt: new Date().toISOString(),
      }),
      getUsers: vi.fn().mockResolvedValue([]),
    } as unknown as UsersService;

    const { container } = render(
      <AuthProvider initialUser={adminUser}>
        <UsersScreen usersServiceInstance={mockUsersService} currentUserRole={Role.ADMIN} />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/nombre completo/i), 'Dra. Andrea Castro');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'andrea@vetcentral.com');
    await user.type(screen.getByLabelText(/contraseña temporal/i), 'Segura123!');
    await user.type(screen.getByLabelText(/cédula \/ licencia profesional/i), 'MP-98234');

    await user.click(screen.getByRole('button', { name: /registrar usuario/i }));

    await waitFor(() => {
      expect(mockUsersService.createUser).toHaveBeenCalledWith({
        name: 'Dra. Andrea Castro',
        email: 'andrea@vetcentral.com',
        password: 'Segura123!',
        role: Role.VET,
        licenseNumber: 'MP-98234',
      });
      expect(screen.getByText(/usuario "Dra. Andrea Castro" creado exitosamente/i)).toBeInTheDocument();
    });

    // Cero emojis en la vista con feedback
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('despliega "Este correo ya está registrado" en español ante respuesta HTTP 409 Conflict', async () => {
    const user = userEvent.setup();
    const mockUsersService = {
      createUser: vi.fn().mockRejectedValue(new ApiError('Email already registered', 409)),
      getUsers: vi.fn().mockResolvedValue([]),
    } as unknown as UsersService;

    render(
      <AuthProvider initialUser={adminUser}>
        <UsersScreen usersServiceInstance={mockUsersService} currentUserRole={Role.ADMIN} />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/nombre completo/i), 'Dr. Carlos Mendoza');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'carlos@vetcentral.com');
    await user.type(screen.getByLabelText(/contraseña temporal/i), 'Password123!');
    await user.type(screen.getByLabelText(/cédula \/ licencia profesional/i), 'MP-11223');

    await user.click(screen.getByRole('button', { name: /registrar usuario/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Este correo ya está registrado')).toBeInTheDocument();
    });
  });
});
