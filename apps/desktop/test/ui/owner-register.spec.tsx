import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnerRegisterScreen } from '../../src/screens/OwnerRegisterScreen';
import { OwnersService } from '../../src/services/owners.service';
import { ApiError } from '../../src/services/api.client';

describe('UI Integration: OwnerRegisterScreen (RF-68, RF-60, RNF-3)', () => {
  it('debe alertar y bloquear registro duplicado si lookup responde exists true (sin filtrar datos personales)', async () => {
    const user = userEvent.setup();
    const handleOwnerCreated = vi.fn();

    const mockLookup = vi.fn().mockResolvedValue({
      exists: true,
      pendingConsent: true,
    });
    const mockCreate = vi.fn();

    const mockOwnersService = {
      lookup: mockLookup,
      createOwner: mockCreate,
      getOwners: vi.fn(),
    } as unknown as OwnersService;

    render(
      <OwnerRegisterScreen
        ownersServiceInstance={mockOwnersService}
        onOwnerCreated={handleOwnerCreated}
      />
    );

    // Ingresar documento
    const docInput = screen.getByPlaceholderText(/12345678/);
    await user.type(docInput, '12345678');

    // Clic en botón Verificar
    const verifyBtn = screen.getByRole('button', { name: /verificar/i });
    await user.click(verifyBtn);

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith('12345678');
      expect(
        screen.getByText(/ya se encuentra registrado en la red veterinaria/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/debe escanear el llavero nfc de una de sus mascotas/i)
      ).toBeInTheDocument();
    });

    // El botón de guardar permanece deshabilitado para evitar duplicados
    const submitBtn = screen.getByRole('button', { name: /guardar propietario/i });
    expect(submitBtn).toBeDisabled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('debe mostrar mensaje amigable de límite superado ante error HTTP 429 en lookup', async () => {
    const user = userEvent.setup();

    const mockLookup = vi.fn().mockRejectedValue(
      new ApiError('Too Many Requests', 429, { statusCode: 429, message: 'ThrottlerException' })
    );

    const mockOwnersService = {
      lookup: mockLookup,
      createOwner: vi.fn(),
      getOwners: vi.fn(),
    } as unknown as OwnersService;

    render(<OwnerRegisterScreen ownersServiceInstance={mockOwnersService} />);

    const docInput = screen.getByPlaceholderText(/12345678/);
    await user.type(docInput, '99999999');

    const verifyBtn = screen.getByRole('button', { name: /verificar/i });
    await user.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/límite de consultas superado/i)
      ).toBeInTheDocument();
    });
  });

  it('debe permitir dar de alta exitosamente cuando lookup responde exists false', async () => {
    const user = userEvent.setup();
    const handleOwnerCreated = vi.fn();

    const mockLookup = vi.fn().mockResolvedValue({
      exists: false,
    });
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'owner-created-uuid',
      documentId: '87654321',
      name: 'Laura',
      lastName: 'Torres',
      phone: '+584241234567',
      email: 'laura@test.com',
      address: 'Av. Libertador',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockOwnersService = {
      lookup: mockLookup,
      createOwner: mockCreate,
      getOwners: vi.fn(),
    } as unknown as OwnersService;

    render(
      <OwnerRegisterScreen
        ownersServiceInstance={mockOwnersService}
        onOwnerCreated={handleOwnerCreated}
      />
    );

    // 1. Verificar documento disponible
    const docInput = screen.getByPlaceholderText(/12345678/);
    await user.type(docInput, '87654321');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/documento disponible/i)
      ).toBeInTheDocument();
    });

    // 2. Completar campos del formulario
    await user.type(screen.getByPlaceholderText('Ej: Laura'), 'Laura');
    await user.type(screen.getByPlaceholderText(/martínez pérez/i), 'Torres');
    await user.type(screen.getByPlaceholderText(/\+584121234567/), '+584241234567');

    // 3. Guardar propietario
    const submitBtn = screen.getByRole('button', { name: /guardar propietario/i });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Registro Exitoso/i)).toBeInTheDocument();
    });
  });
});
