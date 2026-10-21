import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../../src/screens/login-screen';
import { AuthProvider } from '../../src/context/auth.context';
import { ApiClient } from '../../src/services/api.client';
import { AuthService } from '../../src/services/auth.service';
import { Role } from '@vet-app/shared-types';

describe('UI Integration: LoginScreen (RF-1, RF-2, RNF-3)', () => {
  it('debe renderizar los campos de correo, contraseña y el botón de ingreso', () => {
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>
    );

    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar al sistema/i })).toBeInTheDocument();
  });

  it('debe invocar onSuccess cuando las credenciales son válidas', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          clinicId: 'clinic-123',
          user: {
            id: 'user-1',
            email: 'vet@test.com',
            name: 'Dr. López',
            role: Role.VET,
            clinicId: 'clinic-123',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new ApiClient({ fetchFn: mockFetch });
    const authService = new AuthService(client);

    render(
      <AuthProvider apiClientInstance={client} authServiceInstance={authService}>
        <LoginScreen onSuccess={handleSuccess} />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/correo/i), 'vet@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /ingresar al sistema/i }));

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('debe desplegar mensaje de alerta accesible (role="alert") cuando el login falla con 401', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'Credenciales inválidas',
          error: 'Unauthorized',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new ApiClient({ fetchFn: mockFetch });
    const authService = new AuthService(client);

    render(
      <AuthProvider apiClientInstance={client} authServiceInstance={authService}>
        <LoginScreen />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/correo/i), 'bad@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /ingresar al sistema/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/credenciales inválidas/i);
    });
  });
});
