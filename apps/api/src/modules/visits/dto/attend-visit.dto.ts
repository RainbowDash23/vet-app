import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * DTO para el registro de atención médica, anamnesis, constantes vitales y tratamiento (RF-43, RF-44).
 */
export class AttendVisitDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  treatment?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @IsInt()
  capillaryRefillTime?: number;
}
