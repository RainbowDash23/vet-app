import { PetSpecies, PetSex, ReproductiveStatus } from '../enums/species.enum';
import { TagStatus } from '../enums/tag-status.enum';
import { ClinicPatientSource } from '../enums/clinic-patient-source.enum';
import { OwnerResponseDto } from './owner.dto';
import { TagResponseDto } from './tag.dto';

export interface CreatePetDto {
  name: string;
  species: PetSpecies;
  breed?: string | null;
  sex?: PetSex;
  birthDate?: string | Date | null;
  isApproximateBirthDate?: boolean;
  color?: string | null;
  reproductiveStatus?: ReproductiveStatus;
  notes?: string | null;
  ownerId: string;
}

export interface UpdatePetDto {
  name?: string;
  species?: PetSpecies;
  breed?: string | null;
  sex?: PetSex;
  birthDate?: string | Date | null;
  isApproximateBirthDate?: boolean;
  color?: string | null;
  reproductiveStatus?: ReproductiveStatus;
  notes?: string | null;
}

export interface ClinicPatientDto {
  id: string;
  clinicId: string;
  petId: string;
  source: ClinicPatientSource;
  addedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PetResponseDto {
  id: string;
  name: string;
  species: PetSpecies;
  breed?: string | null;
  sex: PetSex;
  birthDate?: string | Date | null;
  isApproximateBirthDate: boolean;
  color?: string | null;
  reproductiveStatus: ReproductiveStatus;
  notes?: string | null;
  ownerId: string;
  createdByClinicId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  owner?: OwnerResponseDto;
  tags?: TagResponseDto[];
  clinicPatients?: ClinicPatientDto[];
  isInRoster?: boolean;
  activeGrant?: {
    id: string;
    expiresAt: string | Date;
    scope?: string;
  } | null;
}

export interface PetMinimalFiliationDto {
  name: string;
  species: PetSpecies;
  breed?: string | null;
  sex: PetSex;
  ownerPhone: string;
  tagStatus: TagStatus;
  ownerName?: string;
}
