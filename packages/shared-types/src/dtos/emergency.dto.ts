import { PetSpecies } from '../enums/species.enum';

export interface EmergencyPetProfileDto {
  petName: string;
  species: PetSpecies;
  breed?: string | null;
  ownerName: string;
  ownerPhone: string;
  ownerSecondaryPhone?: string | null;
  clinicName: string;
  clinicPhone?: string | null;
}
