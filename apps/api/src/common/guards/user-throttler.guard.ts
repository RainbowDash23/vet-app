import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Guardia de limitación de tasa (rate limiting) que rastrea los intentos por usuario autenticado (RF-60).
 * Extrae el identificador del usuario desde req.user o decodificando la cabecera Authorization: Bearer.
 * Si la petición no cuenta con credenciales de usuario, recurre a la IP de origen.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user;
    const userId = user?.userId || user?.id || user?.sub;
    if (userId) {
      return `user-${userId}`;
    }

    // Si req.user aún no está poblado por ejecutarse antes de JwtAuthGuard,
    // extraemos el identificador de usuario directamente del token Bearer si está presente
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          const tokenUserId = payload.userId || payload.sub || payload.id || payload.email;
          if (tokenUserId) {
            return `user-${tokenUserId}`;
          }
        } catch {
          // Si el token no es decodificable, continuar al fallback
        }
      }
    }

    return super.getTracker(req);
  }
}
