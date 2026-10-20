import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO para la búsqueda y paginación estándar de dueños en el padrón centralizado (RF-16).
 */
export class SearchOwnerQueryDto {
  @IsOptional()
  @IsString({ message: 'El término de búsqueda general debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query?: string;

  @IsOptional()
  @IsString({ message: 'El documento de identidad debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  documentId?: string;

  @IsOptional()
  @IsString({ message: 'El número telefónico debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @IsOptional()
  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima permitida es 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo permitido es 1' })
  @Max(100, { message: 'El límite máximo permitido es 100' })
  limit?: number = 10;
}
