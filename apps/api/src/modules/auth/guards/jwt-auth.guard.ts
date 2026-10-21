import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenRevocationService } from '../token-revocation.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly tokenRevocation: TokenRevocationService;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    tokenRevocationService?: TokenRevocationService,
  ) {
    this.tokenRevocation = tokenRevocationService ?? new TokenRevocationService();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autorización no proporcionado');
    }

    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });

      // Verificación de lista de revocaciones / denylist de JTI (RF-5)
      if (payload.jti && this.tokenRevocation.isTokenRevoked(payload.jti)) {
        throw new UnauthorizedException('Token de acceso revocado');
      }

      // Inyectar en el objeto request exclusivamente los claims verificados por la firma criptográfica
      request.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        clinicId: payload.clinicId,
        jti: payload.jti,
        exp: payload.exp,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token de autorización inválido o expirado');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
