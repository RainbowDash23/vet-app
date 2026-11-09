import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickSearchModal } from '../../src/components/quick-search/quick-search-modal';
import type { PetsService } from '../../src/services/pets.service';
import type { PetResponseDto } from '@vet-app/shared-types';

describe('UI: Paleta de Búsqueda Rápida Ctrl+K (QuickSearchModal)', () => {
  let mockPetsService: Partial<PetsService>;
  const mockPets: PetResponseDto[] = [
    {
      id: 'pet-1',
      name: 'Max',
      species: 'CANINE',
      breed: 'Golden Retriever',
      sex: 'MALE',
      birthDate: '2021-05-10T00:00:00.000Z',
      isApproximateBirthDate: false,
      status: 'ACTIVE',
      clinicId: 'clinic-1',
      ownerId: 'owner-1',
      owner: {
        id: 'owner-1',
        name: 'Carlos',
        lastName: 'Mendoza',
        fullName: 'Carlos Mendoza',
        documentId: '45678912',
        phone: '987654321',
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'pet-2',
      name: 'Misi',
      species: 'FELINE',
      breed: 'Siamés',
      sex: 'FEMALE',
      birthDate: '2022-03-15T00:00:00.000Z',
      isApproximateBirthDate: false,
      status: 'ACTIVE',
      clinicId: 'clinic-1',
      ownerId: 'owner-2',
      owner: {
        id: 'owner-2',
        name: 'Lucía',
        lastName: 'Fernández',
        fullName: 'Lucía Fernández',
        // Sin documentId para verificar resiliencia ante datos restringidos
      },
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    mockPetsService = {
      getPets: vi.fn().mockResolvedValue({
        data: mockPets,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
      }),
    };
  });

  it('no debe renderizar nada si isOpen es false', () => {
    render(
      <QuickSearchModal
        isOpen={false}
        onClose={vi.fn()}
        currentUserRole="ADMIN"
        onSelectPet={vi.fn()}
        onSelectScreen={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cuando isOpen es true, despliega combobox accesible, atajo Esc y acciones rápidas según rol ADMIN', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        currentUserRole="ADMIN"
        onSelectPet={vi.fn()}
        onSelectScreen={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const input = screen.getByRole('combobox', { name: /buscar pacientes o acciones/i });
    expect(input).toBeInTheDocument();

    // Acciones rápidas para ADMIN deben incluir Gestión de Personal/Usuarios
    expect(screen.getByText(/Gestión de Usuarios y Personal/i)).toBeInTheDocument();
    expect(screen.getByText('Registrar Mascota')).toBeInTheDocument();
    expect(screen.getByText('Registrar Propietario')).toBeInTheDocument();

    // Verificación de ausencia estricta de emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('filtra acciones para rol RECEPTION: no incluye Gestión de Personal ni Auditoría', () => {
    render(
      <QuickSearchModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserRole="RECEPTION"
        onSelectPet={vi.fn()}
        onSelectScreen={vi.fn()}
      />
    );

    expect(screen.getByText('Registrar Mascota')).toBeInTheDocument();
    expect(screen.getByText('Agenda de Visitas')).toBeInTheDocument();
    expect(screen.queryByText(/Gestión de Usuarios y Personal/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Auditoría de Accesos')).not.toBeInTheDocument();
  });

  it('ejecuta búsqueda con debounce de 250ms al escribir y renderiza tarjetas de pacientes', async () => {
    const user = userEvent.setup();
    const handleSelectPet = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserRole="ADMIN"
        petsServiceInstance={mockPetsService as PetsService}
        onSelectPet={handleSelectPet}
        onSelectScreen={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox', { name: /buscar pacientes o acciones/i });
    await user.type(input, 'Max');

    // Debe llamar a getPets con debounce
    await waitFor(() => {
      expect(mockPetsService.getPets).toHaveBeenCalledWith({
        query: 'Max',
        page: 1,
        limit: 10,
      });
    });

    // Renderiza los pacientes
    await screen.findByText('Max');
    expect(screen.getByText('Canino')).toBeInTheDocument();
    expect(screen.getByText(/Carlos Mendoza/i)).toBeInTheDocument();
    expect(screen.getByText(/Doc: 45678912/i)).toBeInTheDocument();

    // Paciente sin documento de identidad (proyección segura)
    expect(screen.getByText('Misi')).toBeInTheDocument();
    expect(screen.getByText('Felino')).toBeInTheDocument();
    expect(screen.getByText(/Lucía Fernández/i)).toBeInTheDocument();

    // Selección de paciente
    const petOption = screen.getByTestId('quick-search-pet-pet-1');
    await user.click(petOption);
    expect(handleSelectPet).toHaveBeenCalledWith('pet-1');
  });

  it('navegación con teclado: flecha abajo selecciona siguiente y Enter confirma selección', async () => {
    const user = userEvent.setup();
    const handleSelectScreen = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserRole="ADMIN"
        onSelectPet={vi.fn()}
        onSelectScreen={handleSelectScreen}
      />
    );

    const input = screen.getByRole('combobox', { name: /buscar pacientes o acciones/i });

    // La primera acción rápida está seleccionada por defecto (índice 0: action-pet-register)
    // Presionar Flecha Abajo para avanzar a la segunda acción (action-owner-register)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSelectScreen).toHaveBeenCalledWith('owner-register');
  });

  it('muestra estado vacío accesible cuando no hay coincidencias de pacientes', async () => {
    const user = userEvent.setup();
    (mockPetsService.getPets as any).mockResolvedValueOnce({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserRole="ADMIN"
        petsServiceInstance={mockPetsService as PetsService}
        onSelectPet={vi.fn()}
        onSelectScreen={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox', { name: /buscar pacientes o acciones/i });
    await user.type(input, 'Inexistente');

    await waitFor(() => {
      expect(screen.getByText(/No se encontraron pacientes para/i)).toBeInTheDocument();
    });
  });

  it('cierra la paleta al hacer clic en el botón de cerrar', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        currentUserRole="ADMIN"
        onSelectPet={vi.fn()}
        onSelectScreen={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /cerrar búsqueda rápida/i });
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});
