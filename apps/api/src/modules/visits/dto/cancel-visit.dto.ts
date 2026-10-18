import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CancelVisitDto as ICancelVisitDto } from '@vet-app/shared-types';

/**
 * DTO para la cancelación justificada obligatoria de una visita clínica (RF-41, RF-42).
 */
export class CancelVisitDto implements ICancelVisitDto {
  @IsString({ message: 'El motivo de cancelación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de cancelación no puede estar vacío' })
  @MinLength(10, { message: 'El motivo de cancelación debe contener al menos 10 caracteres' })
  @MaxLength(500, { message: 'El motivo de cancelación no puede exceder los 500 caracteres' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  cancellationReason!: string;
}
