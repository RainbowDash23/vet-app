import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicManagementScreen } from '../../src/screens/clinic-management-screen';
import { AuthProvider } from '../../src/context/auth.context';
import { ClinicsService } from '../../src/services/clinics.service';
import { ApiError } from '../../src/services/api.client';
import { Role } from '@vet-app/shared-types';
import type { ClinicResponseDto, AuthUserSummary } from '@vet-app/shared-types';

describe('UI Integration: Pantalla de Datos de la Clínica (ClinicManagementScreen)', () => {
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

  const mockClinic: ClinicResponseDto = {
    id: 'clinic-uuid',
    code: 'VET-CENTRAL',
    name: 'Clínica Veterinaria Central',
    phone: '+593987654321',
    email: 'contacto@vetcentral.com',
    address: 'Av. Siempre Viva 742',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('solo se renderiza para el rol ADMIN; de lo contrario muestra mensaje de acceso restringido', () => {
    const { container, rerender } = render(
      <AuthProvider initialUser={vetUser}>
        <ClinicManagementScreen currentUserRole={Role.VET} />
      </AuthProvider>,
    );

    expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument();
    expect(emojiRegex.test(container.innerHTML)).toBe(false);

    rerender(
      <AuthProvider initialUser={adminUser}>
        <ClinicManagementScreen currentUserRole={Role.ADMIN} initialClinic={mockClinic} />
      </AuthProvider>,
    );

    expect(screen.getByRole('heading', { name: /datos de la clínica/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('valida el teléfono exigiendo formato internacional estricto E.164 (^\+[1-9]\d{1,14}$)', async () => {
    const user = userEvent.setup();
    const mockService = {
      getCurrentClinic: vi.fn().mockResolvedValue(mockClinic),
      updateCurrentClinic: vi.fn(),
    } as unknown as ClinicsService;

    render(
      <AuthProvider initialUser={adminUser}>
        <ClinicManagementScreen
          currentUserRole={Role.ADMIN}
          initialClinic={mockClinic}
          clinicsServiceInstance={mockService}
        />
      </AuthProvider>,
    );

    const phoneInput = screen.getByLabelText(/teléfono de emergencia/i);
    const submitButton = screen.getByRole('button', { name: /guardar cambios/i });

    // Ingresar teléfono inválido sin prefijo +
    await user.clear(phoneInput);
    await user.type(phoneInput, '0987654321');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/debe cumplir con el formato internacional e\.164/i)).toBeInTheDocument();
    });
    expect(mockService.updateCurrentClinic).not.toHaveBeenCalled();

    // Corregir a formato E.164 válido
    await user.clear(phoneInput);
    await user.type(phoneInput, '+573001234567');

    mockService.updateCurrentClinic = vi.fn().mockResolvedValue({
      ...mockClinic,
      phone: '+573001234567',
    });

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockService.updateCurrentClinic).toHaveBeenCalledWith({
        name: mockClinic.name,
        phone: '+573001234567',
        address: mockClinic.address,
      });
      expect(screen.getByText(/datos de la clínica actualizados exitosamente/i)).toBeInTheDocument();
    });
  });

  it('despliega los errores de la API en español ante fallos en la actualización', async () => {
    const user = userEvent.setup();
    const mockService = {
      getCurrentClinic: vi.fn().mockResolvedValue(mockClinic),
      updateCurrentClinic: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            'El teléfono debe cumplir con el formato internacional E.164 estricto (ej. +593987654321)',
            400,
          ),
        ),
    } as unknown as ClinicsService;

    render(
      <AuthProvider initialUser={adminUser}>
        <ClinicManagementScreen
          currentUserRole={Role.ADMIN}
          initialClinic={mockClinic}
          clinicsServiceInstance={mockService}
        />
      </AuthProvider>,
    );

    const phoneInput = screen.getByLabelText(/teléfono de emergencia/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, '+573009999999');

    const submitButton = screen.getByRole('button', { name: /guardar cambios/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /el teléfono debe cumplir con el formato internacional e\.164/i,
      );
    });
  });
});
