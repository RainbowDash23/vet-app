import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientFileScreen } from '../../src/screens/patient-file-screen';
import { EditOwnerModal } from '../../src/components/screens/edit-owner-modal';
import { EditPetModal } from '../../src/components/screens/edit-pet-modal';
import { AddVaccinationModal } from '../../src/components/screens/add-vaccination-modal';
import { PetsService } from '../../src/services/pets.service';
import { OwnersService } from '../../src/services/owners.service';
import { VaccinationsService } from '../../src/services/vaccinations.service';
import { ApiError } from '../../src/services/api.client';
import { Role, TagStatus, PetSpecies, PetSex, ReproductiveStatus } from '@vet-app/shared-types';
import type { PetResponseDto, OwnerResponseDto, ResolveTagSuccessDto, TagResponseDto } from '@vet-app/shared-types';

describe('UI Integration: Auditoría CRUD y Contratos (PatientFileScreen & Modales)', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]/u;

  const mockOwner: OwnerResponseDto = {
    id: 'owner-uuid-1',
    documentId: '1712345678',
    name: 'Carlos',
    lastName: 'Mendoza',
    phone: '+593987654321',
    email: 'carlos@ejemplo.com',
    address: 'Calle Falsa 123',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const mockPet: PetResponseDto = {
    id: 'pet-uuid-1',
    name: 'Firulais',
    species: PetSpecies.CANINE,
    breed: 'Labrador',
    sex: PetSex.MALE,
    birthDate: '2022-05-10T00:00:00.000Z',
    isApproximateBirthDate: false,
    color: 'Dorado',
    reproductiveStatus: ReproductiveStatus.INTACT,
    notes: 'Alergia al pollo',
    ownerId: mockOwner.id,
    createdByClinicId: 'clinic-uuid-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    owner: mockOwner,
    tags: [
      {
        id: 'tag-uuid-1',
        uid: '04A1B2C3D4E5',
        petId: 'pet-uuid-1',
        status: TagStatus.ACTIVE,
        publicCode: 'pub-code-123',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };

  const mockInitialData: ResolveTagSuccessDto = {
    registered: true,
    uid: '04A1B2C3D4E5',
    hasFullAccess: true,
    pet: mockPet,
    publicCode: 'pub-code-123',
  };

  it('EditOwnerModal valida formato E.164 y llama a updateOwner', async () => {
    const user = userEvent.setup();
    const mockOwnersService = {
      updateOwner: vi.fn().mockResolvedValue({
        ...mockOwner,
        name: 'Carlos Alberto',
        phone: '+593999999999',
      }),
    } as unknown as OwnersService;

    const onUpdated = vi.fn();
    const onClose = vi.fn();

    render(
      <EditOwnerModal
        isOpen={true}
        owner={mockOwner}
        onClose={onClose}
        onOwnerUpdated={onUpdated}
        ownersService={mockOwnersService}
      />,
    );

    expect(screen.getByRole('heading', { name: /editar datos del propietario/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^nombre \*/i);
    const phoneInput = screen.getByLabelText(/teléfono/i);
    const submitButton = screen.getByRole('button', { name: /guardar cambios/i });

    // Modificar nombre y teléfono
    await user.clear(nameInput);
    await user.type(nameInput, 'Carlos Alberto');
    await user.clear(phoneInput);
    await user.type(phoneInput, '+593999999999');

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOwnersService.updateOwner).toHaveBeenCalledWith(mockOwner.id, {
        name: 'Carlos Alberto',
        lastName: mockOwner.lastName,
        phone: '+593999999999',
        email: mockOwner.email,
        address: mockOwner.address,
      });
      expect(onUpdated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('EditPetModal actualiza campos de la mascota y llama a updatePet', async () => {
    const user = userEvent.setup();
    const mockPetsService = {
      updatePet: vi.fn().mockResolvedValue({
        ...mockPet,
        name: 'Firulais Segundo',
        color: 'Negro',
      }),
    } as unknown as PetsService;

    const onUpdated = vi.fn();
    const onClose = vi.fn();

    render(
      <EditPetModal
        isOpen={true}
        pet={mockPet}
        onClose={onClose}
        onPetUpdated={onUpdated}
        petsService={mockPetsService}
      />,
    );

    const nameInput = screen.getByLabelText(/nombre de la mascota \*/i);
    const colorInput = screen.getByLabelText(/color \/ pelaje/i);
    const submitButton = screen.getByRole('button', { name: /guardar cambios/i });

    await user.clear(nameInput);
    await user.type(nameInput, 'Firulais Segundo');
    await user.clear(colorInput);
    await user.type(colorInput, 'Negro');

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockPetsService.updatePet).toHaveBeenCalledWith(
        mockPet.id,
        expect.objectContaining({
          name: 'Firulais Segundo',
          color: 'Negro',
        }),
      );
      expect(onUpdated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('AddVaccinationModal registra una vacuna con fecha de próximo refuerzo (nextDueDate)', async () => {
    const user = userEvent.setup();
    const mockVaccinationsService = {
      createVaccination: vi.fn().mockResolvedValue({
        id: 'vac-1',
        petId: mockPet.id,
        vaccineName: 'Rabia Anual',
        batchNumber: 'LOTE-2026-A',
        appliedAt: '2026-11-09T00:00:00.000Z',
        nextDueDate: '2027-11-09T00:00:00.000Z',
        notes: 'Inoculación subcutánea sin efectos adversos',
      }),
    } as unknown as VaccinationsService;

    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(
      <AddVaccinationModal
        isOpen={true}
        petId={mockPet.id}
        onClose={onClose}
        onVaccinationCreated={onCreated}
        vaccinationsService={mockVaccinationsService}
      />,
    );

    const vaccineInput = screen.getByLabelText(/nombre del biológico \/ vacuna \*/i);
    const batchInput = screen.getByLabelText(/número de lote/i);
    const nextDueInput = screen.getByLabelText(/próximo refuerzo/i);
    const notesInput = screen.getByLabelText(/observaciones o reacciones/i);
    const submitButton = screen.getByRole('button', { name: /registrar vacuna/i });

    await user.type(vaccineInput, 'Rabia Anual');
    await user.type(batchInput, 'LOTE-2026-A');
    await user.type(nextDueInput, '2027-11-09');
    await user.type(notesInput, 'Inoculación subcutánea sin efectos adversos');

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockVaccinationsService.createVaccination).toHaveBeenCalledWith(
        expect.objectContaining({
          petId: mockPet.id,
          vaccineName: 'Rabia Anual',
          batchNumber: 'LOTE-2026-A',
          nextDueDate: expect.stringContaining('2027-11-09'),
        }),
      );
      expect(onCreated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('baja lógica de mascota: captura HTTP 409 Conflict y muestra el mensaje claro', async () => {
    const user = userEvent.setup();
    const mockPetsService = {
      resolveTag: vi.fn().mockResolvedValue(mockInitialData),
      getPetById: vi.fn().mockResolvedValue(mockPet),
      getMedicalHistory: vi.fn().mockResolvedValue({ data: [] }),
      getVaccinations: vi.fn().mockResolvedValue({ data: [] }),
      getTagsByPet: vi.fn().mockResolvedValue(mockPet.tags),
      softDeletePet: vi.fn().mockRejectedValue(
        new ApiError('No se puede eliminar una mascota con visitas clínicas registradas', 409),
      ),
    } as unknown as PetsService;

    render(
      <PatientFileScreen
        currentClinicId="clinic-uuid-1"
        currentUserRole={Role.ADMIN}
        initialData={mockInitialData}
        petsService={mockPetsService}
        autoListenNfc={false}
      />,
    );

    const deleteButton = screen.getByTestId('delete-pet-button');
    expect(deleteButton).toBeInTheDocument();

    await user.click(deleteButton);

    // Diálogo de confirmación abierto
    expect(screen.getByRole('heading', { name: /confirmar baja de paciente/i })).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /confirmar baja/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockPetsService.softDeletePet).toHaveBeenCalledWith(mockPet.id);
      expect(
        screen.getByText('No se puede eliminar una mascota con visitas clínicas registradas'),
      ).toBeInTheDocument();
    });
  });

  it('marcar tag como LOST o DAMAGED abre confirmación y llama a reportTagStatus', async () => {
    const user = userEvent.setup();
    const mockPetsService = {
      resolveTag: vi.fn().mockResolvedValue(mockInitialData),
      getPetById: vi.fn().mockResolvedValue(mockPet),
      getMedicalHistory: vi.fn().mockResolvedValue({ data: [] }),
      getVaccinations: vi.fn().mockResolvedValue({ data: [] }),
      getTagsByPet: vi.fn().mockResolvedValue(mockPet.tags),
      reportTagStatus: vi.fn().mockResolvedValue({
        id: 'tag-uuid-1',
        uid: '04A1B2C3D4E5',
        status: TagStatus.LOST,
      }),
    } as unknown as PetsService;

    render(
      <PatientFileScreen
        currentClinicId="clinic-uuid-1"
        currentUserRole={Role.ADMIN}
        initialData={mockInitialData}
        petsService={mockPetsService}
        autoListenNfc={false}
      />,
    );

    // Esperar a que se carguen los tags
    await waitFor(() => {
      expect(screen.getByTestId('tag-mark-lost-button')).toBeInTheDocument();
    });

    const lostButton = screen.getByTestId('tag-mark-lost-button');
    await user.click(lostButton);

    // Diálogo de confirmación
    expect(
      screen.getByRole('heading', { name: /reportar llavero como extraviado/i }),
    ).toBeInTheDocument();

    const confirmReportButton = screen.getByRole('button', { name: /confirmar reporte/i });
    await user.click(confirmReportButton);

    await waitFor(() => {
      expect(mockPetsService.reportTagStatus).toHaveBeenCalledWith('tag-uuid-1', {
        status: TagStatus.LOST,
        reason: 'Reporte de extraviado',
      });
    });
  });
});
