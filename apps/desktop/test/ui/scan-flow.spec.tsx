import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppContent } from '../../src/App';
import { AuthProvider } from '../../src/context/auth.context';
import { PetsService } from '../../src/services/pets.service';
import { ApiClient, ApiError } from '../../src/services/api.client';
import { fakeTagReader } from '../../src/readers/fake-tag-reader';
import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary } from '@vet-app/shared-types';

describe('UI Integration: Flujo de Escaneo NFC y Navegación (RF-70, RT-2, RF-33)', () => {
  const authenticatedVet: AuthUserSummary = {
    id: 'vet-uuid-1',
    email: 'vet@test.com',
    name: 'Dr. Alejandro',
    role: Role.VET,
    clinicId: 'clinic-uuid-1',
  };

  const createMockApiClient = () =>
    ({
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/clinics/current')) {
          return Promise.resolve({ id: 'clinic-uuid-1', name: 'Clínica Veterinaria Central' });
        }
        if (url.includes('/owners')) {
          return Promise.resolve({ data: [], meta: { total: 0 } });
        }
        return Promise.resolve({ data: [] });
      }),
    }) as unknown as ApiClient;

  it('con sesión activa, un tag registrado abre la ficha clínica (PatientFileScreen)', async () => {
    const mockResolve = vi.fn().mockImplementation((_uid: string) =>
      Promise.resolve({
        registered: true,
        uid: '04A1B2C3',
        pet: {
          id: 'pet-123',
          name: 'Toby',
          species: 'CANINE',
          breed: 'Labrador',
        },
        hasFullAccess: true,
        grantActive: true,
      })
    );

    const mockPetsService = {
      resolveTag: mockResolve,
      getPetById: vi.fn(),
      getMedicalHistory: vi.fn().mockResolvedValue({ data: [] }),
      getVaccinations: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as PetsService;

    render(
      <AuthProvider initialUser={authenticatedVet}>
        <AppContent
          petsServiceInstance={mockPetsService}
          apiClientInstance={createMockApiClient()}
          initialScreen="pet-list"
        />
      </AuthProvider>
    );

    // Simular lectura de tag NFC dentro de act
    await act(async () => {
      fakeTagReader.emitTag('04A1B2C3');
    });

    await waitFor(
      () => {
        expect(mockResolve).toHaveBeenCalledWith('04A1B2C3');
        expect(screen.getByText('Toby')).toBeInTheDocument();
        expect(screen.getByText(/Resumen y Constantes/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('con sesión activa, un tag no registrado (registered: false) redirige a PetRegisterScreen con UID precargado', async () => {
    const mockResolve = vi.fn().mockResolvedValue({
      registered: false,
      uid: '04UNREGISTERED',
    });

    const mockPetsService = {
      resolveTag: mockResolve,
    } as unknown as PetsService;

    render(
      <AuthProvider initialUser={authenticatedVet}>
        <AppContent
          petsServiceInstance={mockPetsService}
          apiClientInstance={createMockApiClient()}
          initialScreen="pet-list"
        />
      </AuthProvider>
    );

    await act(async () => {
      fakeTagReader.emitTag('04UNREGISTERED');
    });

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith('04UNREGISTERED');
      expect(screen.getByText(/Registrar Nueva Mascota/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/escanee el llavero/i)).toHaveValue('04UNREGISTERED');
    });
  });

  it('con sesión activa, un tag con vínculo revocado (403) despliega la alerta de revocación', async () => {
    const mockResolve = vi.fn().mockRejectedValue(
      new ApiError('Acceso denegado: El consentimiento ha sido REVOCADO', 403, {
        statusCode: 403,
        message: 'Acceso denegado: El consentimiento ha sido REVOCADO',
      })
    );

    const mockPetsService = {
      resolveTag: mockResolve,
    } as unknown as PetsService;

    render(
      <AuthProvider initialUser={authenticatedVet}>
        <AppContent
          petsServiceInstance={mockPetsService}
          apiClientInstance={createMockApiClient()}
          initialScreen="pet-list"
        />
      </AuthProvider>
    );

    await act(async () => {
      fakeTagReader.emitTag('04REVOKED');
    });

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith('04REVOKED');
      expect(screen.getByText(/Acceso Revocado/i)).toBeInTheDocument();
      expect(
        screen.getByText(/El consentimiento o vínculo de atención médica para este paciente ha sido REVOCADO/i)
      ).toBeInTheDocument();
    });
  });

  it('sin sesión activa, los escaneos NFC son completamente ignorados', async () => {
    const mockResolve = vi.fn();
    const mockPetsService = {
      resolveTag: mockResolve,
    } as unknown as PetsService;

    render(
      <AuthProvider initialUser={null}>
        <AppContent
          petsServiceInstance={mockPetsService}
          apiClientInstance={createMockApiClient()}
        />
      </AuthProvider>
    );

    // Pantalla de login visible
    expect(screen.getByRole('button', { name: /ingresar al sistema/i })).toBeInTheDocument();

    await act(async () => {
      fakeTagReader.emitTag('04SOMEUID');
    });

    // Esperar y verificar que no hubo intento de resolución
    await new Promise((r) => setTimeout(r, 100));
    expect(mockResolve).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ficha Clínica/i)).not.toBeInTheDocument();
  });
});
