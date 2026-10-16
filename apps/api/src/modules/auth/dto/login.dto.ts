import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { LoginRequestDto } from '@vet-app/shared-types';

export class LoginDto implements LoginRequestDto {
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;
}
