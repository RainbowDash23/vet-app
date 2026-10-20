import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO para la consulta ciega de existencia de dueños en el padrón centralizado (RF-60).
 */
export class LookupOwnerDto {
  @IsNotEmpty({ message: 'El documento de identidad es obligatorio' })
  @IsString({ message: 'El documento de identidad debe ser una cadena de texto' })
  documentId!: string;
}
