import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { TokenRevocationService } from './token-revocation.service';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  clinicId: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    clinicId: string;
  };
}

export interface LogoutResponse {
  message: string;
  loggedOutAt: string;
}

@Injectable()
export class AuthService {
  private readonly tokenRevocation: TokenRevocationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    tokenRevocationService?: TokenRevocationService,
  ) {
    this.tokenRevocation = tokenRevocationService ?? new TokenRevocationService(prisma);
  }

  /**
   * Autenticación con credenciales (RF-1, RF-2).
   * Valida correo y contraseña contra bcrypt; ante éxito emite Access Token (15m con jti)
   * y Refresh Token (7d) persistido en base de datos.
   */
  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { email, password } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();

    // Buscar el usuario por email que no haya sido eliminado lógicamente
    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
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

    // Generar Access Token JWT firmado (15m) con claims requeridos
    const jti = crypto.randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    // Generar Refresh Token criptográfico y persistir su hash SHA-256 (7 días)
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
      clinicId: user.clinicId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clinicId: user.clinicId,
      },
    };
  }

  /**
   * Rotación atómica de Refresh Token (RF-6).
   * Valida el Refresh Token recibido, revoca el token anterior y emite un nuevo
   * par de credenciales (Access Token 15m + Refresh Token 7d) en una transacción.
   */
  async refreshTokens(refreshDto: RefreshDto): Promise<LoginResponse> {
    const { refreshToken } = refreshDto;
    const tokenHash = this.hashToken(refreshToken);

    // Buscar el token activo, no revocado y vigente
    const existingRecord = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!existingRecord || !existingRecord.user) {
      throw new UnauthorizedException('Token de refresco inválido, revocado o expirado');
    }

    const user = existingRecord.user;

    if (!user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('El usuario no se encuentra autorizado o fue desvinculado');
    }

    // Generar nuevo par de tokens
    const newJti = crypto.randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
      jti: newJti,
    };

    const newAccessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = this.hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Rotación atómica en transacción
    await this.prisma.$transaction(async (tx) => {
      // 1. Revocar el token previo
      await tx.refreshToken.update({
        where: { id: existingRecord.id },
        data: { revokedAt: new Date() },
      });

      // 2. Persistir el nuevo Refresh Token
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
      clinicId: user.clinicId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clinicId: user.clinicId,
      },
    };
  }

  /**
   * Cierre de sesión y revocación en base de datos con denylist de JTI (RF-4).
   * Revoca en la base de datos el refresh token asociado (o todos los refresh tokens
   * del usuario si no se especifica token).
   * Registra el jti del Access Token en tokenRevocationService con su TTL.
   * Retorna { message: 'Sesión cerrada exitosamente', loggedOutAt: new Date().toISOString() }.
   */
  async logout(
    userId: string,
    jti: string,
    expiresAtTimestamp?: number,
    refreshToken?: string,
  ): Promise<LogoutResponse> {
    // 1. Revocar en la base de datos el refresh token asociado o todos los tokens activos del usuario
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else {
      await this.tokenRevocation.revokeUserRefreshTokens(userId);
    }

    // 2. Registrar el jti del Access Token en la denylist con su TTL correspondiente (RF-4)
    if (jti) {
      let expiresAt: Date;
      if (expiresAtTimestamp) {
        const expMs = expiresAtTimestamp < 10000000000 ? expiresAtTimestamp * 1000 : expiresAtTimestamp;
        expiresAt = new Date(expMs);
      } else {
        expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      }
      this.tokenRevocation.revokeToken(jti, expiresAt);
    }

    return {
      message: 'Sesión cerrada exitosamente',
      loggedOutAt: new Date().toISOString(),
    };
  }

  /**
   * Calcula el hash criptográfico SHA-256 de un token opaco.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
