import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { PetSex, PetSpecies, ReproductiveStatus } from '@prisma/client';

/**
 * DTO para la actualización de atributos de una mascota activa (RF-17).
 * Todos los campos son opcionales y sujetos a validación sintáctica estricta.
 */
export class UpdatePetDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEnum(PetSpecies, {
    message: 'La especie debe ser válida: CANINE, FELINE, AVIAN, EQUINE, RODENT, REPTILE, OTHER',
  })
  species?: PetSpecies;

  @IsOptional()
  @IsString({ message: 'La raza debe ser una cadena de texto' })
  @MaxLength(100, { message: 'La raza no puede exceder 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  breed?: string | null;

  @IsOptional()
  @IsEnum(PetSex, {
    message: 'El sexo debe ser válido: MALE, FEMALE o UNKNOWN',
  })
  sex?: PetSex;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de nacimiento debe ser una fecha válida (formato ISO-8601)' })
  birthDate?: Date;

  @IsOptional()
  @IsBoolean({ message: 'isApproximateBirthDate debe ser un valor booleano' })
  isApproximateBirthDate?: boolean;

  @IsOptional()
  @IsString({ message: 'El color debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El color no puede exceder 50 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  color?: string | null;

  @IsOptional()
  @IsEnum(ReproductiveStatus, {
    message: 'El estado reproductivo debe ser válido: INTACT, NEUTERED, SPAYED o UNKNOWN',
  })
  reproductiveStatus?: ReproductiveStatus;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string | null;

  @IsOptional()
  @IsUUID('all', { message: 'El identificador del dueño debe ser un UUID válido' })
  ownerId?: string;
}
