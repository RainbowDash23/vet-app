import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxDate,
  MaxLength,
} from 'class-validator';
import { PetSex, PetSpecies, ReproductiveStatus } from '@prisma/client';

/**
 * DTO para la creación de una nueva mascota vinculada a un dueño (RF-17).
 */
export class CreatePetDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsNotEmpty({ message: 'La especie es obligatoria' })
  @IsEnum(PetSpecies, {
    message: 'La especie debe ser válida: CANINE, FELINE, AVIAN, EQUINE, RODENT, REPTILE, OTHER',
  })
  species!: PetSpecies;

  @IsOptional()
  @IsString({ message: 'La raza debe ser una cadena de texto' })
  @MaxLength(100, { message: 'La raza no puede exceder 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  breed?: string | null;

  @IsOptional()
  @IsEnum(PetSex, {
    message: 'El sexo debe ser válido: MALE, FEMALE o UNKNOWN',
  })
  sex?: PetSex = PetSex.UNKNOWN;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de nacimiento debe ser una fecha válida (formato ISO-8601)' })
  @MaxDate(() => new Date(), { message: 'La fecha de nacimiento no puede ser una fecha futura' })
  birthDate?: Date | null;

  @IsOptional()
  @IsBoolean({ message: 'isApproximateBirthDate debe ser un valor booleano' })
  isApproximateBirthDate?: boolean = false;

  @IsOptional()
  @IsString({ message: 'El color debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El color no puede exceder 50 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  color?: string | null;

  @IsOptional()
  @IsEnum(ReproductiveStatus, {
    message: 'El estado reproductivo debe ser válido: INTACT, NEUTERED, SPAYED o UNKNOWN',
  })
  reproductiveStatus?: ReproductiveStatus = ReproductiveStatus.UNKNOWN;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string | null;

  @IsNotEmpty({ message: 'El identificador del dueño es obligatorio' })
  @IsUUID('all', { message: 'El identificador del dueño debe ser un UUID válido' })
  ownerId!: string;
}
