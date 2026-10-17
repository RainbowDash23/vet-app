import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO para el registro de nuevos dueños en el padrón centralizado (RF-14).
 * Valida sintaxis estricta:
 * - documentId: alfanumérico de 6 a 20 caracteres.
 * - name y lastName: cadenas no vacías de 2 a 100 caracteres.
 * - phone: formato internacional estricto E.164 (^\+[1-9]\d{1,14}$).
 * - email: opcional, formato RFC 5322.
 * - address: opcional, hasta 250 caracteres.
 */
export class CreateOwnerDto {
  @IsString({ message: 'El documento de identidad debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El documento de identidad no puede estar vacío' })
  @Length(6, 20, { message: 'El documento de identidad debe tener entre 6 y 20 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  documentId!: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El apellido no puede estar vacío' })
  @Length(2, 100, { message: 'El apellido debe tener entre 2 y 100 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @IsString({ message: 'El número telefónico debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El número telefónico no puede estar vacío' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'El teléfono debe cumplir con el formato internacional E.164 estricto (ej. +593987654321)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

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
