import { PetSpecies, PetSex } from '../enums/species.enum';

export interface EmergencyPetProfileDto {
  petName: string;
  species: PetSpecies;
  breed?: string | null;
  sex?: PetSex | null;
  ownerName: string;
  ownerPhone: string;
  ownerSecondaryPhone?: string | null;
  clinicName: string;
  clinicPhone?: string | null;
}
