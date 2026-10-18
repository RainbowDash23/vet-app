import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * DTO para la vinculación de un nuevo tag NFC a una mascota (RF-30).
 */
export class AssignTagDto {
  @IsString({ message: 'El UID del tag debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El UID del tag no puede estar vacío' })
  uid!: string;

  @IsUUID('4', { message: 'El identificador de la mascota debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El identificador de la mascota es obligatorio' })
  petId!: string;
}
