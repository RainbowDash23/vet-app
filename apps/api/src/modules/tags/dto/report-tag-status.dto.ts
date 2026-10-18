import { IsEnum, IsNotEmpty } from 'class-validator';
import { TagStatus } from '@prisma/client';

/**
 * DTO para el reporte de extravío, deterioro o inactivación de un tag NFC (RF-32).
 */
export class ReportTagStatusDto {
  @IsEnum(TagStatus, {
    message: 'El estado del tag debe ser uno de los valores válidos: ACTIVE, INACTIVE, LOST, DAMAGED',
  })
  @IsNotEmpty({ message: 'El estado del tag es obligatorio' })
  status!: TagStatus;
}
