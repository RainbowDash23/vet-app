import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * DTO para la carga de archivos adjuntos clínicos (RF-49).
 */
export class UploadAttachmentDto {
  @IsOptional()
  @IsUUID('4', { message: 'El petId debe ser un UUID v4 válido' })
  petId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El visitId debe ser un UUID v4 válido' })
  visitId?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  description?: string;
}
