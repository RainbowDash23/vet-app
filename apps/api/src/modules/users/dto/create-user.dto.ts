import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * DTO para el registro de nuevos colaboradores y personal clínico (RF-10, RF-11).
 * Excluye explícitamente clinicId del payload para impedir inyecciones manuales (RF-9, RNF-8).
 */
export class CreateUserDto {
  @IsString({ message: 'El nombre es requerido y debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(6, { message: 'La contraseña debe contener al menos 6 caracteres' })
  password!: string;

  @IsEnum(Role, { message: 'El rol asignado debe ser ADMIN, VET o RECEPTION' })
  @IsNotEmpty({ message: 'El rol es requerido' })
  role!: Role;

  /**
   * Cédula profesional: opcional en general, pero estrictamente obligatoria
   * y no vacía cuando el rol es VET (RF-10).
   */
  @ValidateIf((o: CreateUserDto) => o.role === Role.VET)
  @IsNotEmpty({
    message: 'El número de cédula profesional (licenseNumber) es obligatorio para el rol VET',
  })
  @IsString({ message: 'El número de cédula profesional debe ser una cadena de texto' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  licenseNumber?: string | null;

  @IsOptional()
  @IsString({ message: 'La especialidad médica debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  specialty?: string | null;

  @IsOptional()
  @IsString({ message: 'El número telefónico debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string | null;
}
