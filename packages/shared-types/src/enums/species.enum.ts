export enum PetSpecies {
  CANINE = 'CANINE',
  FELINE = 'FELINE',
  AVIAN = 'AVIAN',
  EQUINE = 'EQUINE',
  RODENT = 'RODENT',
  REPTILE = 'REPTILE',
  OTHER = 'OTHER',
}

export { PetSpecies as Species };
Object.freeze(PetSpecies);

export enum PetSex {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  UNKNOWN = 'UNKNOWN',
}

Object.freeze(PetSex);

export enum ReproductiveStatus {
  INTACT = 'INTACT',
  NEUTERED = 'NEUTERED',
  SPAYED = 'SPAYED',
  UNKNOWN = 'UNKNOWN',
}

Object.freeze(ReproductiveStatus);
