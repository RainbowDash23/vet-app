import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { VisitStatus } from '@prisma/client';

/**
 * DTO para la consulta paginada y filtrado de visitas clínicas.
 */
export class QueryVisitDto {
  @IsOptional()
  @IsUUID('4', { message: 'El petId debe ser un UUID v4 válido' })
  petId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El vetId debe ser un UUID v4 válido' })
  vetId?: string;

  @IsOptional()
  @IsEnum(VisitStatus, {
    message: 'El estado debe ser un valor válido del enum VisitStatus',
  })
  status?: VisitStatus;

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
