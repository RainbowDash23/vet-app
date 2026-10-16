import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO para la actualización de perfil, especialidad y disponibilidad horaria de colaboradores (RF-12).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede ser una cadena vacía' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string | null;

  @IsOptional()
  @IsString({ message: 'El número de cédula profesional debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  licenseNumber?: string | null;

  @IsOptional()
  @IsString({ message: 'La especialidad médica debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  specialty?: string | null;

  @IsOptional()
  @IsString({ message: 'La disponibilidad horaria debe ser una cadena de texto o JSON serializado' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  availability?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'El estado isActive debe ser un valor booleano' })
  isActive?: boolean;
}
