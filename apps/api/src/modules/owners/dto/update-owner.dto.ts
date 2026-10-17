import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO para la actualización de datos de contacto o filiación de un dueño (RF-14).
 * Todos los campos son opcionales pero sujetos a validación sintáctica estricta cuando se suministran.
 */
export class UpdateOwnerDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @Length(2, 100, { message: 'El apellido debe tener entre 2 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsString({ message: 'El número telefónico debe ser una cadena de texto' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'El teléfono debe cumplir con el formato internacional E.164 estricto (ej. +593987654321)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida bajo RFC 5322' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : value === '' ? null : value))
  email?: string | null;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(250, { message: 'La dirección no puede exceder 250 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string | null;
}
