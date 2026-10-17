import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PetSpecies } from '@prisma/client';

/**
 * DTO para la búsqueda y paginación estándar de mascotas en el padrón centralizado.
 */
export class SearchPetQueryDto {
  @IsOptional()
  @IsString({ message: 'El término de búsqueda general debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query?: string;

  @IsOptional()
  @IsUUID('all', { message: 'El ownerId debe ser un UUID válido' })
  ownerId?: string;

  @IsOptional()
  @IsEnum(PetSpecies, {
    message: 'La especie debe ser válida: CANINE, FELINE, AVIAN, EQUINE, RODENT, REPTILE, OTHER',
  })
  species?: PetSpecies;

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
