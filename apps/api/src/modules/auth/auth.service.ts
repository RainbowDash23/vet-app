import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    clinicId: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { email, password } = loginDto;

    // Buscar el usuario por email que no haya sido eliminado lógicamente
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        deletedAt: null,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales de acceso inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('El usuario se encuentra inactivo. Contacta a un administrador');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales de acceso inválidas');
    }

    // El payload contiene la identidad indiscutible del usuario y su clínica de pertenencia
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clinicId: user.clinicId,
      },
    };
  }
}
