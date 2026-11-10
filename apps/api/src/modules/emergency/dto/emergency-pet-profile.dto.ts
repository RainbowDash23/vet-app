import { EmergencyPetProfileDto as IEmergencyPetProfileDto, PetSpecies, PetSex } from '@vet-app/shared-types';

/**
 * DTO de respuesta pública de contingencia y rescate (RF-36).
 *
 * Expone de forma estricta y exclusiva:
 * - Nombre de la mascota, especie biológica, sexo y raza.
 * - Nombre completo y números telefónicos de contacto del propietario.
 * - Nombre y teléfono de la clínica veterinaria de referencia.
 *
 * Prohibición absoluta: Prohibido exponer identificadores internos de base de datos (id, petId, ownerId, clinicId),
 * dirección física del propietario, documentos de identidad, notas clínicas, visitas o diagnósticos (RF-36).
 */
export class EmergencyPetProfileDto implements IEmergencyPetProfileDto {
  petName!: string;
  species!: PetSpecies;
  breed?: string | null;
  sex?: PetSex | null;
  ownerName!: string;
  ownerPhone!: string;
  ownerSecondaryPhone?: string | null;
  clinicName!: string;
  clinicPhone?: string | null;
}
