import { UpdateClinicDto as IUpdateClinicDto } from '@vet-app/shared-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateClinicDto implements IUpdateClinicDto {
  @IsOptional()
  @IsString({ message: 'El nombre de la clínica debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre de la clínica no puede estar vacío' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'El teléfono debe cumplir con el formato internacional E.164 estricto (ej. +593987654321)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string | null;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'El estado isActive debe ser un valor booleano' })
  isActive?: boolean;
}
