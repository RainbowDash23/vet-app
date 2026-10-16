import { IsNotEmpty, IsString } from 'class-validator';
import { RefreshTokenDto } from '@vet-app/shared-types';

export class RefreshDto implements RefreshTokenDto {
  @IsString({ message: 'El token de refresco debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El token de refresco es requerido' })
  refreshToken!: string;
}
