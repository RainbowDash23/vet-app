import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PetListScreen } from '../../src/screens/PetListScreen';
import { PetsService } from '../../src/services/pets.service';
import { PetSpecies, PetSex, ReproductiveStatus, TagStatus } from '@vet-app/shared-types';
import type { PetResponseDto, PaginatedResult } from '@vet-app/shared-types';

describe('UI: PetListScreen (SPEC EARS)', () => {
  const mockPets: PetResponseDto[] = [
    {
      id: 'pet-1',
      name: 'Firulais',
      species: PetSpecies.CANINE,
      breed: 'Labrador',
      sex: PetSex.MALE,
      birthDate: '2020-01-01',
      color: 'Dorado',
      reproductiveStatus: ReproductiveStatus.INTACT,
      ownerId: 'owner-1',
      createdByClinicId: 'clinic-1',
      createdAt: '2023-01-15T10:00:00.000Z',
      updatedAt: '2023-01-15T10:00:00.000Z',
      owner: {
        id: 'owner-1',
        name: 'Juan',
        lastName: 'Pérez',
        documentId: '0912345678',
        phone: '+593987654321',
        email: 'juan@example.com',
        address: 'Calle 123',
        createdAt: '2023-01-15T10:00:00.000Z',
        updatedAt: '2023-01-15T10:00:00.000Z',
      },
      tags: [
        {
          id: 'tag-1',
          uid: '04A1B2C3D4E5',
          petId: 'pet-1',
          status: TagStatus.ACTIVE,
          publicCode: 'PUB-123',
          createdAt: '2023-01-15T10:00:00.000Z',
          updatedAt: '2023-01-15T10:00:00.000Z',
        },
      ],
    },
    {
      id: 'pet-2',
      name: 'Michi',
      species: PetSpecies.FELINE,
      breed: 'Siamés',
      sex: PetSex.FEMALE,
      ownerId: 'owner-2',
      createdByClinicId: 'clinic-1',
      createdAt: '2023-02-20T12:00:00.000Z',
      updatedAt: '2023-02-20T12:00:00.000Z',
      owner: {
        id: 'owner-2',
        name: 'Ana',
        lastName: 'Gómez',
        documentId: '0987654321',
        phone: '+593912345678',
        email: 'ana@example.com',
        address: 'Av. 456',
        createdAt: '2023-02-20T12:00:00.000Z',
        updatedAt: '2023-02-20T12:00:00.000Z',
      },
      tags: [],
    },
  ];

  const createMockPetsService = (pets = mockPets) => {
    return {
      getPets: vi.fn().mockImplementation((params?: { query?: string; page?: number; limit?: number }) => {
        let filtered = [...pets];
        if (params?.query) {
          const q = params.query.toLowerCase();
          filtered = filtered.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.owner?.name.toLowerCase().includes(q) ||
              p.owner?.documentId?.includes(q)
          );
        }
        const page = params?.page || 1;
        const limit = params?.limit || 10;
        const start = (page - 1) * limit;
        const data = filtered.slice(start, start + limit);
        return Promise.resolve<PaginatedResult<PetResponseDto>>({
          data,
          total: filtered.length,
          page,
          limit,
          totalPages: Math.ceil(filtered.length / limit) || 1,
        });
      }),
    } as unknown as PetsService;
  };

  it('renderiza la lista de pacientes con sus columnas principales y cero emojis', async () => {
    const mockService = createMockPetsService();
    const { container } = render(<PetListScreen petsServiceInstance={mockService} />);

    await waitFor(() => {
      expect(screen.getByText('Firulais')).toBeInTheDocument();
      expect(screen.getByText('Michi')).toBeInTheDocument();
    });

    expect(screen.getByText(/Juan Pérez/i)).toBeInTheDocument();
    expect(screen.getByText(/Doc: 0912345678/i)).toBeInTheDocument();
    expect(screen.getByText('UID: 04A1B2C3D4E5')).toBeInTheDocument();
    expect(screen.getByText('Sin tag')).toBeInTheDocument();

    // Verificación de cero emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });

  it('permite filtrar pacientes por nombre mediante la barra de búsqueda con debounce', async () => {
    const mockService = createMockPetsService();
    const user = userEvent.setup();

    render(<PetListScreen petsServiceInstance={mockService} />);

    await waitFor(() => {
      expect(screen.getByText('Firulais')).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('searchbox', { name: /buscar pacientes/i });
    await user.type(searchInput, 'Michi');

    await waitFor(() => {
      expect(screen.getByText('Michi')).toBeInTheDocument();
      expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    });
  });

  it('invoca onSelectPet al hacer clic en una fila o en Ver Ficha', async () => {
    const mockService = createMockPetsService();
    const onSelectPet = vi.fn();
    const user = userEvent.setup();

    render(<PetListScreen petsServiceInstance={mockService} onSelectPet={onSelectPet} />);

    await waitFor(() => {
      expect(screen.getByText('Firulais')).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByRole('button', { name: /ver ficha/i });
    await user.click(viewButtons[0]);

    expect(onSelectPet).toHaveBeenCalledWith('pet-1');
  });

  it('muestra estado vacío cuando no hay pacientes', async () => {
    const mockService = createMockPetsService([]);
    render(<PetListScreen petsServiceInstance={mockService} />);

    await waitFor(() => {
      expect(screen.getByText('No se encontraron pacientes')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/La clínica actual no tiene pacientes en su lista aún/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/simulación en la barra lateral/i)).not.toBeInTheDocument();
  });

  it('no realiza actualizaciones de estado tras el desmontaje del componente (evita ReferenceError: window is not defined)', async () => {
    let resolvePets!: (value: unknown) => void;
    const deferredPromise = new Promise((resolve) => {
      resolvePets = resolve;
    });
    const mockService = {
      getPets: vi.fn().mockReturnValue(deferredPromise),
    } as unknown as PetsService;

    const { unmount } = render(<PetListScreen petsServiceInstance={mockService} />);
    unmount();

    // Simular la destruccion de window como ocurre al desmontar el entorno JSDOM en CI
    const originalWindow = global.window;
    delete (global as unknown as { window?: unknown }).window;

    try {
      resolvePets({ data: [], meta: { total: 0, totalPages: 1 } });
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      (global as unknown as { window?: unknown }).window = originalWindow;
    }
  });
});
