import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhatsNewModal } from '../../src/components/whats-new/whats-new-modal';
import { Sidebar } from '../../src/components/layout/sidebar';
import { AppContent } from '../../src/App';
import { AuthProvider } from '../../src/context/auth.context';
import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary } from '@vet-app/shared-types';
import type { ApiClient } from '../../src/services/api.client';

describe('UI: Modal de Novedades de Versión y Visualización en Sidebar (SPEC EARS)', () => {
  it('no renderiza nada cuando isOpen es false', () => {
    render(<WhatsNewModal isOpen={false} onClose={vi.fn()} version="0.1.1" />);
    expect(screen.queryByTestId('whats-new-modal')).not.toBeInTheDocument();
  });

  it('cuando isOpen es true, renderiza título, versión 0.1.1 y 4 puntos destacados en español sin emojis', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <WhatsNewModal isOpen={true} onClose={handleClose} version="0.1.1" />
    );

    expect(screen.getByTestId('whats-new-modal')).toBeInTheDocument();
    expect(screen.getByText('Versión 0.1.1')).toBeInTheDocument();
    expect(screen.getByText(/Novedades de la versión 0.1.1/i)).toBeInTheDocument();

    // Verificación de los puntos clave
    expect(screen.getByText(/búsqueda rápida/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+K/i)).toBeInTheDocument();

    // Cero emojis en el contenido
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('el botón "Entendido" invoca onClose al hacer clic', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(<WhatsNewModal isOpen={true} onClose={handleClose} version="0.1.1" />);

    const confirmBtn = screen.getByRole('button', { name: /entendido/i });
    await user.click(confirmBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('Sidebar renderiza la versión v0.1.1 y el enlace accesible "Novedades"', async () => {
    const user = userEvent.setup();
    const handleOpenWhatsNew = vi.fn();

    // Mock electronAPI en window
    (window as any).electronAPI = {
      getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.1', platform: 'win32', arch: 'x64' }),
    };

    render(
      <Sidebar
        activeScreen="pet-list"
        onSelectScreen={vi.fn()}
        role="ADMIN"
        onOpenWhatsNew={handleOpenWhatsNew}
      />
    );

    // Esperar a que getAppInfo resuelva y muestre v0.1.1
    await waitFor(() => {
      expect(screen.getByText('v0.1.1')).toBeInTheDocument();
    });

    const whatsNewBtn = screen.getByRole('button', { name: /novedades/i });
    expect(whatsNewBtn).toBeInTheDocument();

    await user.click(whatsNewBtn);
    expect(handleOpenWhatsNew).toHaveBeenCalledTimes(1);
  });

  it('AppContent abre automáticamente el modal de novedades si getWhatsNewStatus responde showWhatsNew true', async () => {
    const user = userEvent.setup();
    const markSeenMock = vi.fn().mockResolvedValue({ success: true });

    (window as any).electronAPI = {
      getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.1', platform: 'win32', arch: 'x64' }),
      getWhatsNewStatus: vi.fn().mockResolvedValue({
        showWhatsNew: true,
        currentVersion: '0.1.1',
        lastSeenVersion: '0.1.0',
      }),
      markWhatsNewSeen: markSeenMock,
    };

    const mockApiClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/clinics/current')) {
          return Promise.resolve({ id: 'clinic-1', name: 'Clínica Veterinaria Central' });
        }
        return Promise.resolve({ data: [], meta: { total: 0, totalPages: 1 } });
      }),
      onUnauthorized: vi.fn().mockReturnValue(() => {}),
      getRefreshToken: vi.fn().mockReturnValue(null),
    } as unknown as ApiClient;

    const adminUser: AuthUserSummary = {
      id: 'admin-1',
      email: 'admin@vetcentral.com',
      name: 'Dr. López',
      role: Role.ADMIN,
      clinicId: 'clinic-1',
    };

    render(
      <AuthProvider initialUser={adminUser} apiClientInstance={mockApiClient}>
        <AppContent />
      </AuthProvider>
    );

    // Debe abrir automáticamente el modal de novedades tras actualizar
    await waitFor(() => {
      expect(screen.getByTestId('whats-new-modal')).toBeInTheDocument();
    });

    expect(screen.getByText('Versión 0.1.1')).toBeInTheDocument();

    // Al hacer clic en "Entendido", debe marcarse como vista en el proceso principal
    const entendidoBtn = screen.getByRole('button', { name: /entendido/i });
    await user.click(entendidoBtn);

    expect(markSeenMock).toHaveBeenCalledWith('0.1.1');
  });
});
