import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { VisitStatus } from '@prisma/client';

/**
 * DTO para el agendamiento y registro inicial de una visita clínica (RF-39).
 */
export class CreateVisitDto {
  @IsUUID('4', { message: 'El identificador de la mascota debe ser un UUID v4 válido' })
  petId!: string;

  @IsUUID('4', { message: 'El identificador del veterinario debe ser un UUID v4 válido' })
  vetId!: string;

  @IsDateString({}, { message: 'La fecha programada debe tener un formato ISO 8601 válido' })
  scheduledDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La duración estimada en minutos debe ser un número entero' })
  @Min(15, { message: 'La duración mínima estimada es de 15 minutos' })
  @Max(120, { message: 'La duración máxima estimada es de 120 minutos' })
  durationMinutes?: number = 30;

  @IsString({ message: 'El motivo de la visita debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de la visita no puede estar vacío' })
  @Length(3, 255, { message: 'El motivo de la visita debe contener entre 3 y 255 caracteres' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;

  @IsOptional()
  @IsEnum(VisitStatus, {
    message: 'El estado debe ser un valor permitido del enum VisitStatus (SCHEDULED, PENDING)',
  })
  status?: VisitStatus = VisitStatus.SCHEDULED;
}
