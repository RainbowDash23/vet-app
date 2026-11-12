import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';

/**
 * Guardia de limitación de tasa (rate limiting) que rastrea los intentos por usuario autenticado (RF-60).
 * Exige que el JWT esté criptográficamente verificado y no meramente decodificado.
 * Si el token es inválido, expirado, forjado o no existe, recurre de forma segura a la IP de origen como respaldo.
 * Para intentos anónimos (como /auth/login), rastrea estrictamente por IP del cliente (req.ip con trust proxy)
 * y NUNCA por correo, previniendo ataques de denegación de servicio (bloqueo) contra víctimas legítimas.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly jwtVerifier = new JwtService();

  protected override async getTracker(req: Record<string, any>): Promise<string> {
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

    // 3. Respaldo por dirección IP (obtenida de req.ip de forma segura según trust proxy)
    return super.getTracker(req);
  }

  /**
   * Genera una excepción 429 con mensaje en español y cabecera estándar Retry-After.
   */
  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const retryAfter = Math.max(
      1,
      throttlerLimitDetail.timeToBlockExpire || throttlerLimitDetail.timeToExpire || 60,
    );

    // Asegurar cabecera estándar HTTP Retry-After en segundos
    this.setResponseHeader(res, 'Retry-After', retryAfter);

    const handler = context.getHandler()?.name;
    const message =
      handler === 'login'
        ? `Demasiados intentos de inicio de sesión. Por favor, intente de nuevo en ${retryAfter} segundos.`
        : `Demasiadas solicitudes. Por favor, espere ${retryAfter} segundos antes de intentar nuevamente.`;

    throw new ThrottlerException(message);
  }
}
