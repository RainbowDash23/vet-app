import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @IsOptional()
  @IsString({ message: 'El refreshToken debe ser una cadena de texto válida' })
  refreshToken?: string;
}
