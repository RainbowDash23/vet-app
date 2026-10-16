import { CreateClinicDto as ICreateClinicDto } from '@vet-app/shared-types';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateClinicDto implements ICreateClinicDto {
  @IsString({ message: 'El nombre de la clínica debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre de la clínica es requerido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString({ message: 'El código de la clínica debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código de la clínica es requerido' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'El código de la clínica debe ser alfanumérico (puede incluir guiones o guiones bajos)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  code!: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string | null;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string | null;
}
