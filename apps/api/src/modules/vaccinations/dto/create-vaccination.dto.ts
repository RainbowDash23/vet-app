import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

/**
 * DTO para el registro de una nueva aplicación biológica/vacunación (RF-48).
 */
export class CreateVaccinationDto {
  @IsUUID('4', { message: 'El identificador de la mascota (petId) debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El identificador de la mascota (petId) es obligatorio' })
  petId!: string;

  @IsString({ message: 'El nombre o denominación del biológico debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del biológico no puede estar vacío' })
  @Length(2, 100, {
    message: 'El nombre del biológico debe contener entre 2 y 100 caracteres',
  })
  vaccineName!: string;

  @IsOptional()
  @IsString({ message: 'El número de lote debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El número de lote no puede exceder los 50 caracteres' })
  batchNumber?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha de aplicación debe ser una marca temporal válida en formato ISO 8601' },
  )
  appliedAt?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha del próximo refuerzo debe ser una marca temporal válida en formato ISO 8601' },
  )
  nextDueDate?: string;

  @IsOptional()
  @IsString({ message: 'Las notas u observaciones deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder los 500 caracteres' })
  notes?: string;
}
