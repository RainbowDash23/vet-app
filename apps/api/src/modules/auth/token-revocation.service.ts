import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Servicio de revocación de tokens y denylist en memoria de JTI (RF-4, RF-5).
 * Permite invalidar Access Tokens activos mediante su identificador criptográfico único (jti)
 * y revocar en la base de datos los Refresh Tokens asociados a usuarios.
 */
@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);

  /**
   * Registro en memoria de identificadores de tokens revocados (JTI)
   * mapeados a su fecha/hora de expiración original (TTL).
   */
  private readonly revokedJtis = new Map<string, Date>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Registra un JTI revocado con su marca temporal de expiración (TTL) (RF-4).
   * @param jti Identificador único del Access Token (UUID v4)
   * @param expiresAt Fecha y hora de expiración original del token
   */
  revokeToken(jti: string, expiresAt: Date): void {
    if (!jti) {
      return;
    }
    this.revokedJtis.set(jti, expiresAt);
    this.logger.debug(`Token JTI revocado: ${jti} hasta ${expiresAt.toISOString()}`);
  }

  /**
   * Verifica si un JTI se encuentra en la lista de revocaciones y si aún no ha expirado su TTL (RF-5).
   * Si el TTL ya expiró, el token es purgado automáticamente de la denylist y se retorna false.
   * @param jti Identificador único del Access Token
   * @returns true si el token está revocado y aún dentro de su ventana de validez; false en caso contrario
   */
  isTokenRevoked(jti: string): boolean {
    if (!jti) {
      return false;
    }

    const expiresAt = this.revokedJtis.get(jti);
    if (!expiresAt) {
      return false;
    }

    const now = Date.now();
    if (expiresAt.getTime() <= now) {
      // El TTL del token ya transcurrió de forma natural; se purga de la memoria
      this.revokedJtis.delete(jti);
      return false;
    }

    return true;
  }

  /**
   * Limpia de la memoria todos los tokens revocados cuyo TTL ya haya expirado.
   * @returns Cantidad de tokens purgados
   */
  purgeExpiredTokens(): number {
    const now = Date.now();
    let purgedCount = 0;

    for (const [jti, expiresAt] of this.revokedJtis.entries()) {
      if (expiresAt.getTime() <= now) {
        this.revokedJtis.delete(jti);
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      this.logger.debug(`Purgados ${purgedCount} tokens JTI expirados de la denylist en memoria.`);
    }

    return purgedCount;
  }

  /**
   * Revoca en la base de datos (tabla refresh_tokens) todos los tokens activos del usuario (RF-4).
   * @param userId Identificador único del usuario
   * @returns Cantidad de refresh tokens revocados
   */
  async revokeUserRefreshTokens(userId: string): Promise<number> {
    if (!userId || !this.prisma?.refreshToken) {
      return 0;
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Revocados ${result.count} refresh tokens activos para el usuario ${userId}`);
    return result.count;
  }

  /**
   * Retorna la cantidad actual de tokens revocados en memoria (útil para auditoría y pruebas).
   */
  get size(): number {
    return this.revokedJtis.size;
  }
}
