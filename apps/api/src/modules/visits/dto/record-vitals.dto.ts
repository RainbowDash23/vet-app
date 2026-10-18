import { IsInt, IsNumber, IsOptional } from 'class-validator';

/**
 * DTO para captura de constantes fisiológicas en visitas clínicas (RF-43, RF-44).
 */
export class RecordVitalsDto {
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
