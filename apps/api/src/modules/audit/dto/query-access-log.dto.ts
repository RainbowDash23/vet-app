import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AccessAction } from '@prisma/client';

/**
 * DTO para la consulta paginada y filtrado de trazas en la bitácora de auditoría (RF-25).
 */
export class QueryAccessLogDto {
  @IsOptional()
  @IsUUID('all', { message: 'El identificador de la mascota debe ser un UUID válido' })
  petId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'El identificador de la clínica debe ser un UUID válido' })
  clinicId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'El identificador del usuario debe ser un UUID válido' })
  userId?: string;

  @IsOptional()
  @IsEnum(AccessAction, { message: 'La acción de acceso no es válida' })
  action?: AccessAction;

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
