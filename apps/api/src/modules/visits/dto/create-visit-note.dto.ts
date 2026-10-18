import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO para la adición de notas evolutivas complementarias inmutables en visitas clínicas cerradas (RF-46).
 */
export class CreateVisitNoteDto {
  @IsString({ message: 'El contenido de la nota debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El contenido de la nota no puede estar vacío' })
  @MinLength(5, { message: 'El contenido de la nota debe contener al menos 5 caracteres' })
  @MaxLength(2000, { message: 'El contenido de la nota no puede exceder los 2000 caracteres' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;
}
