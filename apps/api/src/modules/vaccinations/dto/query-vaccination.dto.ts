import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * DTO para la consulta paginada de registros de vacunación.
 */
export class QueryVaccinationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El número de página debe ser un número entero' })
  @Min(1, { message: 'El número de página debe ser mayor o igual a 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite de elementos debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo de elementos es 1' })
  @Max(100, { message: 'El límite máximo de elementos por página es 100' })
  limit?: number = 10;

  @IsOptional()
  @IsUUID('4', { message: 'El petId de filtrado debe ser un UUID v4 válido' })
  petId?: string;
}
