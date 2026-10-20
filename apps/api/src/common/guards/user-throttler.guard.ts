import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Guardia de limitación de tasa (rate limiting) que rastrea los intentos por usuario autenticado (RF-60).
 * Exige que el JWT esté criptográficamente verificado y no meramente decodificado.
 * Si el token es inválido, expirado, forjado o no existe, recurre de forma segura a la IP de origen como respaldo.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly jwtVerifier = new JwtService();

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 1. Si req.user ya fue poblado y verificado por JwtAuthGuard en la tubería
    const user = req.user;
    const userId = user?.userId || user?.id || user?.sub;
    if (userId) {
      return `user-${userId}`;
    }

    // 2. Si req.user aún no está poblado, extraemos y verificamos criptográficamente el token Bearer
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const secret = process.env.JWT_SECRET;
          if (secret) {
            const verifiedPayload = this.jwtVerifier.verify(token, { secret });
            const tokenUserId = verifiedPayload?.userId || verifiedPayload?.sub || verifiedPayload?.id;
            if (tokenUserId) {
              return `user-${tokenUserId}`;
            }
          }
        } catch {
          // Token con firma inválida, forjada, alterada o expirada:
          // Se descarta de inmediato la identidad y se respalda en la IP
        }
      }
    }

    // 3. Respaldo por dirección IP
    return super.getTracker(req);
  }
}
