import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AccessAction } from '@prisma/client';

/**
 * DTO para la creación de un registro en la bitácora de auditoría inmutable (RF-25, RF-37).
 */
export class CreateAccessLogDto {
  @IsNotEmpty({ message: 'El identificador de la mascota es obligatorio' })
  @IsUUID('all', { message: 'El identificador de la mascota debe ser un UUID válido' })
  petId!: string;

  @IsOptional()
  @IsUUID('all', { message: 'El identificador de la clínica debe ser un UUID válido' })
  clinicId?: string | null;

  @IsOptional()
  @IsUUID('all', { message: 'El identificador del usuario debe ser un UUID válido' })
  userId?: string | null;

  @IsNotEmpty({ message: 'La acción de acceso es obligatoria' })
  @IsEnum(AccessAction, { message: 'La acción de acceso no es válida' })
  action!: AccessAction;

  @IsOptional()
  @IsString({ message: 'La dirección IP debe ser una cadena de texto' })
  ipAddress?: string | null;

  @IsOptional()
  @IsString({ message: 'El agente de usuario debe ser una cadena de texto' })
  userAgent?: string | null;
}
