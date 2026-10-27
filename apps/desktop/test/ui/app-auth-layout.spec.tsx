import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppContent } from '../../src/App';
import { AuthProvider } from '../../src/context/auth.context';
import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary } from '@vet-app/shared-types';
import { ApiClient } from '../../src/services/api.client';

describe('UI Integration: Autenticación, Layout y Cero Emojis (SPEC EARS)', () => {
  const createMockApiClient = () =>
    ({
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/clinics/current')) {
          return Promise.resolve({ id: 'clinic-1', name: 'Clínica Veterinaria Central' });
        }
        return Promise.resolve({ data: [], meta: { total: 0, totalPages: 1 } });
      }),
      onUnauthorized: vi.fn().mockReturnValue(() => {}),
      getRefreshToken: vi.fn().mockReturnValue(null),
    }) as unknown as ApiClient;

  it('cuando no exista sesión autenticada, muestra únicamente login sin sidebar, sin header, sin hardware y sin logout', () => {
    const mockApiClient = createMockApiClient();

    const { container } = render(
      <AuthProvider initialUser={null} apiClientInstance={mockApiClient}>
        <AppContent />
      </AuthProvider>
    );

    // Debe mostrar la pantalla de login
    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar al sistema/i })).toBeInTheDocument();

    // NO debe existir header (role="banner")
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();

    // NO debe existir sidebar (role="complementary")
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    // NO debe existir botón "Cerrar Sesión"
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).not.toBeInTheDocument();

    // NO debe existir el indicador de hardware
    expect(screen.queryByLabelText(/hardware serial/i)).not.toBeInTheDocument();

    // Cero emojis en el render no autenticado
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('cuando el usuario se autentica, despliega el layout completo con Header, Sidebar e información del usuario', async () => {
    const mockApiClient = createMockApiClient();
    const adminUser: AuthUserSummary = {
      id: 'admin-1',
      email: 'admin@vetcentral.com',
      name: 'Dra. María González',
      role: Role.ADMIN,
      clinicId: 'clinic-1',
    };

    const { container } = render(
      <AuthProvider initialUser={adminUser} apiClientInstance={mockApiClient}>
        <AppContent />
      </AuthProvider>
    );

    // Esperar a que la pantalla inicial (PetListScreen) y datos de clínica se carguen
    await screen.findByRole('heading', { name: /lista de pacientes/i });
    await screen.findByText('Clínica Veterinaria Central');

    // Layout principal visible
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    // Nombre de usuario y botón de cierre de sesión
    expect(screen.getByText('Dra. María González')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();

    // Cero emojis en el render del layout
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('el botón "Simular lectura NFC" no debe existir por defecto en la interfaz', async () => {
    const mockApiClient = createMockApiClient();
    const vetUser: AuthUserSummary = {
      id: 'vet-1',
      email: 'vet@vetcentral.com',
      name: 'Dr. Roberto',
      role: Role.VET,
      clinicId: 'clinic-1',
    };

    render(
      <AuthProvider initialUser={vetUser} apiClientInstance={mockApiClient}>
        <AppContent />
      </AuthProvider>
    );

    // Esperar a que la pantalla inicial resuelva su carga asíncrona
    await screen.findByRole('heading', { name: /lista de pacientes/i });

    // El botón de simulación debe estar ausente (VITE_DEV_TOOLS no está activo)
    expect(screen.queryByRole('button', { name: /simular lectura nfc/i })).not.toBeInTheDocument();
  });
});
