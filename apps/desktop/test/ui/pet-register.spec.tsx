import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PetRegisterScreen } from '../../src/screens/PetRegisterScreen';
import { PetsService } from '../../src/services/pets.service';
import { OwnersService } from '../../src/services/owners.service';
import { PetSpecies, PetSex, ReproductiveStatus } from '@vet-app/shared-types';
import { ApiError } from '../../src/services/api.client';

describe('UI Integration: PetRegisterScreen (RF-69, RF-30, RNF-3)', () => {
  const mockOwnersList = [
    {
      id: 'owner-uuid-1',
      documentId: '11111111',
      name: 'Carlos',
      lastName: 'Mendoza',
      phone: '+584141234567',
      email: 'carlos@test.com',
      address: 'Calle 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'owner-uuid-2',
      documentId: '22222222',
      name: 'Ana',
      lastName: 'Silva',
      phone: '+584129876543',
      email: 'ana@test.com',
      address: 'Calle 2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('debe cargar la lista de dueños y precargar el UID si se suministra', async () => {
    const mockOwnersService = {
      getOwners: vi.fn().mockResolvedValue({
        data: mockOwnersList,
        total: 2,
        page: 1,
        limit: 100,
        totalPages: 1,
      }),
    } as unknown as OwnersService;

    const mockPetsService = {
      createPet: vi.fn(),
      assignTag: vi.fn(),
    } as unknown as PetsService;

    render(
      <PetRegisterScreen
        initialNfcUid="04A1B2C3"
        ownersServiceInstance={mockOwnersService}
        petsServiceInstance={mockPetsService}
      />
    );

    await waitFor(() => {
      expect(mockOwnersService.getOwners).toHaveBeenCalled();
    });

    // Verificar que el select tiene los dueños cargados
    const ownerOption = screen.getByText(/Carlos Mendoza \(C\.I\. 11111111\)/i);
    expect(ownerOption).toBeInTheDocument();

    // Verificar campo UID precargado
    const uidInput = screen.getByPlaceholderText(/escanee el llavero/i);
    expect(uidInput).toHaveValue('04A1B2C3');
  });

  it('debe crear la mascota y asociar el tag NFC exitosamente', async () => {
    const user = userEvent.setup();
    const handlePetCreated = vi.fn();

    const mockOwnersService = {
      getOwners: vi.fn().mockResolvedValue({
        data: mockOwnersList,
        total: 2,
        page: 1,
        limit: 100,
        totalPages: 1,
      }),
    } as unknown as OwnersService;

    const mockCreatePet = vi.fn().mockResolvedValue({
      id: 'new-pet-uuid',
      name: 'Firulais',
      species: PetSpecies.CANINE,
      breed: 'Mestizo',
      sex: PetSex.MALE,
      ownerId: 'owner-uuid-1',
      reproductiveStatus: ReproductiveStatus.INTACT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockAssignTag = vi.fn().mockResolvedValue({
      success: true,
      tag: { uid: '04A1B2C3', petId: 'new-pet-uuid' },
    });

    const mockPetsService = {
      createPet: mockCreatePet,
      assignTag: mockAssignTag,
    } as unknown as PetsService;

    render(
      <PetRegisterScreen
        initialNfcUid="04A1B2C3"
        ownersServiceInstance={mockOwnersService}
        petsServiceInstance={mockPetsService}
        onPetCreated={handlePetCreated}
      />
    );

    // Esperar carga de dueños
    await waitFor(() => {
      expect(screen.getByText(/Carlos Mendoza \(C\.I\. 11111111\)/i)).toBeInTheDocument();
    });

    // Rellenar nombre
    const nameInput = screen.getByPlaceholderText(/ej: max, luna/i);
    await user.type(nameInput, 'Firulais');

    // Enviar formulario
    const submitBtn = screen.getByRole('button', { name: /guardar registro/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreatePet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Firulais',
          ownerId: 'owner-uuid-1',
        })
      );
      expect(mockAssignTag).toHaveBeenCalledWith({
        uid: '04A1B2C3',
        petId: 'new-pet-uuid',
      });
      expect(handlePetCreated).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/paciente registrado con éxito/i)).toBeInTheDocument();
    });
  });

  it('debe alertar con advertencia no bloqueante si la mascota se crea pero el tag falla con 409 Conflict', async () => {
    const user = userEvent.setup();

    const mockOwnersService = {
      getOwners: vi.fn().mockResolvedValue({
        data: mockOwnersList,
        total: 2,
        page: 1,
        limit: 100,
        totalPages: 1,
      }),
    } as unknown as OwnersService;

    const mockCreatePet = vi.fn().mockResolvedValue({
      id: 'new-pet-uuid-2',
      name: 'Luna',
      species: PetSpecies.FELINE,
      ownerId: 'owner-uuid-1',
    });

    const mockAssignTag = vi.fn().mockRejectedValue(
      new ApiError('Tag already active', 409, { statusCode: 409, message: 'Tag already active' })
    );

    const mockPetsService = {
      createPet: mockCreatePet,
      assignTag: mockAssignTag,
    } as unknown as PetsService;

    render(
      <PetRegisterScreen
        initialNfcUid="04DUPLICATE"
        ownersServiceInstance={mockOwnersService}
        petsServiceInstance={mockPetsService}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Carlos Mendoza \(C\.I\. 11111111\)/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText(/ej: max, luna/i);
    await user.type(nameInput, 'Luna');

    const submitBtn = screen.getByRole('button', { name: /guardar registro/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreatePet).toHaveBeenCalled();
      expect(mockAssignTag).toHaveBeenCalled();
      expect(
        screen.getByText(/Mascota creada, pero no se pudo asociar el llavero/i)
      ).toBeInTheDocument();
    });
  });
});
