/**
 * Filtra los datos confidenciales de una mascota y su dueño según el nivel de consentimiento activo (RF-59).
 * Si hasFullAccess es falso, omite de forma estricta address, documentId, email del dueño y notes clínicas de la mascota.
 */
export function filterPetDataByConsent(pet: any, hasFullAccess: boolean): any {
  if (!pet) return pet;

  if (hasFullAccess) {
    return pet;
  }

  const sanitizedPet = { ...pet };
  delete sanitizedPet.notes;

  if (sanitizedPet.owner) {
    const sanitizedOwner = { ...sanitizedPet.owner };
    delete sanitizedOwner.address;
    delete sanitizedOwner.documentId;
    delete sanitizedOwner.email;
    sanitizedPet.owner = sanitizedOwner;
  }

  return sanitizedPet;
}
