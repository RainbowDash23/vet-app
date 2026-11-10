import type { PaginatedResult } from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

export type AccessAction = 'NFC_SCAN' | 'QR_SCAN' | 'MANUAL_LOOKUP' | 'ROSTER_VIEW' | 'EMERGENCY_PORTAL';

export interface AccessLogItem {
  id: string;
  petId: string | null;
  clinicId: string | null;
  userId: string | null;
  action: AccessAction;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string | Date;
  pet?: { id: string; name: string } | null;
  clinic?: { id: string; name: string } | null;
  user?: { id: string; name: string; email: string } | null;
}

export interface QueryAccessLogParams {
  petId?: string;
  clinicId?: string;
  userId?: string;
  action?: AccessAction;
  page?: number;
  limit?: number;
}

/**
 * Servicio para la consulta de bitácoras de auditoría de accesos (RF-25, RF-37, RF-62, RNF-7).
 */
export class AuditService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Consulta global y paginada de trazas de auditoría de la clínica activa (RF-25, RF-62).
   * Restringido exclusivamente al rol ADMIN.
   */
  public async getAccessLogs(
    params?: QueryAccessLogParams,
  ): Promise<PaginatedResult<AccessLogItem>> {
    const searchParams = new URLSearchParams();
    if (params?.petId) searchParams.set('petId', params.petId);
    if (params?.clinicId) searchParams.set('clinicId', params.clinicId);
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    return this.apiClient.get<PaginatedResult<AccessLogItem>>(
      `/audit/access-logs${qs ? `?${qs}` : ''}`,
    );
  }

  /**
   * Consulta del historial cronológico de accesos a una mascota específica (RF-25, RF-62).
   * Autorizado para los roles ADMIN y VET.
   */
  public async getPetAccessLogs(
    petId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<AccessLogItem>> {
    const encodedPetId = encodeURIComponent(petId.trim());
    const searchParams = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return this.apiClient.get<PaginatedResult<AccessLogItem>>(
      `/audit/access-logs/pet/${encodedPetId}?${searchParams.toString()}`,
    );
  }
}

export const auditService = new AuditService();
