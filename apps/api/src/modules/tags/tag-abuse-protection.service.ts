import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { AccessAction } from '@prisma/client';
import { AccessLogsService } from '../audit/access-logs.service';

export interface TagAbuseConfig {
  userLimit: number;
  userTtlMs: number;
  clinicLimit: number;
  clinicTtlMs: number;
  anomalyThreshold: number;
  anomalyWindowMs: number;
}

/**
 * Servicio de protección y mitigación de abusos en el escaneo y resolución de tags NFC.
 * Implementa rate limiting granular (por usuario y por clínica) con 429 en español
 * y detección pasiva de anomalías ante ráfagas de resolución de mascotas distintas.
 */
@Injectable()
export class TagAbuseProtectionService {
  private readonly logger = new Logger(TagAbuseProtectionService.name);

  // Mapas en memoria para seguimiento de límites de escaneo
  private userScans = new Map<string, number[]>();
  private clinicScans = new Map<string, number[]>();

  // Mapa en memoria para detección de anomalías por clínica
  // clinicId -> Array<{ petId: string; timestamp: number }>
  private clinicResolvedPets = new Map<
    string,
    Array<{ petId: string; timestamp: number }>
  >();

  // Configuración con defaults razonables
  private config: TagAbuseConfig = {
    userLimit:
      parseInt(process.env.TAG_RESOLVE_LIMIT_USER || '30', 10) || 30,
    userTtlMs:
      parseInt(process.env.TAG_RESOLVE_TTL_USER || '60000', 10) || 60000,
    clinicLimit:
      parseInt(process.env.TAG_RESOLVE_LIMIT_CLINIC || '100', 10) || 100,
    clinicTtlMs:
      parseInt(process.env.TAG_RESOLVE_TTL_CLINIC || '60000', 10) || 60000,
    anomalyThreshold:
      parseInt(process.env.ANOMALY_RESOLVE_THRESHOLD || '10', 10) || 10,
    anomalyWindowMs:
      parseInt(process.env.ANOMALY_RESOLVE_WINDOW_MS || '300000', 10) || 300000,
  };

  constructor(
    @Optional() private readonly accessLogsService?: AccessLogsService,
  ) {}

  /**
   * Permite actualizar la configuración para pruebas unitarias.
   */
  setConfig(customConfig: Partial<TagAbuseConfig>): void {
    this.config = { ...this.config, ...customConfig };
  }

  getConfig(): TagAbuseConfig {
    return { ...this.config };
  }

  /**
   * Limpia los contadores en memoria (útil entre ejecuciones de pruebas).
   */
  reset(): void {
    this.userScans.clear();
    this.clinicScans.clear();
    this.clinicResolvedPets.clear();
  }

  /**
   * Aplica rate limit específico a GET /tags/resolve/:uid por usuario y por clínica.
   * Si se excede el límite de escaneos:
   * 1. Registra un evento de auditoría en AccessLog con acción NFC_RATE_LIMIT_EXCEEDED.
   * 2. Lanza una excepción HttpException 429 con mensaje claro en español.
   */
  async checkRateLimit(
    clinicId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    tagPetId?: string | null,
  ): Promise<void> {
    const now = Date.now();

    // 1. Verificación por usuario (si userId está presente)
    if (userId) {
      const userKey = `user:${userId}`;
      const userTimestamps = this.userScans.get(userKey) || [];
      const validUserTimestamps = userTimestamps.filter(
        (ts) => now - ts < this.config.userTtlMs,
      );

      if (validUserTimestamps.length >= this.config.userLimit) {
        this.logger.warn(
          `[Rate Limit NFC] Usuario ${userId} superó el límite de ${this.config.userLimit} escaneos en ${this.config.userTtlMs / 1000}s.`,
        );

        if (this.accessLogsService) {
          try {
            await this.accessLogsService.log({
              petId: tagPetId ?? null,
              clinicId,
              userId,
              action: AccessAction.NFC_RATE_LIMIT_EXCEEDED,
              ipAddress: ipAddress ?? null,
              userAgent: userAgent ?? null,
            });
          } catch (err: any) {
            this.logger.error(
              `Error al registrar traza de rate limit por usuario: ${err?.message}`,
            );
          }
        }

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              'Límite de escaneos NFC excedido para este usuario. Por favor, espere antes de intentar nuevamente.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      validUserTimestamps.push(now);
      this.userScans.set(userKey, validUserTimestamps);
    }

    // 2. Verificación por clínica
    const clinicKey = `clinic:${clinicId}`;
    const clinicTimestamps = this.clinicScans.get(clinicKey) || [];
    const validClinicTimestamps = clinicTimestamps.filter(
      (ts) => now - ts < this.config.clinicTtlMs,
    );

    if (validClinicTimestamps.length >= this.config.clinicLimit) {
      this.logger.warn(
        `[Rate Limit NFC] Clínica ${clinicId} superó el límite de ${this.config.clinicLimit} escaneos en ${this.config.clinicTtlMs / 1000}s.`,
      );

      if (this.accessLogsService) {
        try {
          await this.accessLogsService.log({
            petId: tagPetId ?? null,
            clinicId,
            userId,
            action: AccessAction.NFC_RATE_LIMIT_EXCEEDED,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
          });
        } catch (err: any) {
          this.logger.error(
            `Error al registrar traza de rate limit por clínica: ${err?.message}`,
          );
        }
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Límite de escaneos NFC excedido para esta clínica. Por favor, espere antes de intentar nuevamente.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    validClinicTimestamps.push(now);
    this.clinicScans.set(clinicKey, validClinicTimestamps);
  }

  /**
   * Detección de anomalías en resolución de tags NFC.
   * Si una clínica resuelve más de N mascotas distintas en una ventana corta:
   * - Registra un evento de auditoría (NFC_SCAN_ANOMALY).
   * - Registra un log de advertencia.
   * - NO bloquea el flujo.
   */
  async recordAndCheckAnomaly(
    clinicId: string,
    petId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const now = Date.now();
    const history = this.clinicResolvedPets.get(clinicId) || [];
    const recentHistory = history.filter(
      (item) => now - item.timestamp < this.config.anomalyWindowMs,
    );

    recentHistory.push({ petId, timestamp: now });
    this.clinicResolvedPets.set(clinicId, recentHistory);

    const distinctPets = new Set(recentHistory.map((item) => item.petId)).size;

    if (distinctPets > this.config.anomalyThreshold) {
      this.logger.warn(
        `[Alerta de Anomalía NFC] Clínica ${clinicId} ha resuelto ${distinctPets} mascotas distintas en menos de ${this.config.anomalyWindowMs / 1000}s (umbral: ${this.config.anomalyThreshold}).`,
      );

      if (this.accessLogsService) {
        try {
          await this.accessLogsService.log({
            petId,
            clinicId,
            userId,
            action: AccessAction.NFC_SCAN_ANOMALY,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
          });
        } catch (err: any) {
          this.logger.error(
            `Error al registrar evento de auditoría de anomalía: ${err?.message}`,
          );
        }
      }
    }
  }
}
