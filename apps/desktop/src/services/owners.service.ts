import type {
  OwnerResponseDto,
  CreateOwnerDto,
  PaginatedResult,
} from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

export interface OwnerLookupResponse {
  exists: boolean;
  pendingConsent?: boolean;
}

/**
 * Servicio para la gestión de propietarios en el cliente desktop.
 * Consume endpoints de la API NestJS protegidos por JWT (RF-14, RF-15, RF-16, RF-60).
 */
export class OwnersService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Consulta ciega de existencia de un dueño por su documentId (RF-60).
   * Si existe en otra clínica, retorna { exists: true, pendingConsent: true } sin datos personales.
   */
  public async lookup(documentId: string): Promise<OwnerLookupResponse> {
    return this.apiClient.post<OwnerLookupResponse>('/owners/lookup', {
      documentId: documentId.trim(),
    });
  }

  /**
   * Da de alta un nuevo propietario en la clínica activa (RF-14).
   */
  public async createOwner(dto: CreateOwnerDto): Promise<OwnerResponseDto> {
    return this.apiClient.post<OwnerResponseDto>('/owners', {
      ...dto,
      documentId: dto.documentId.trim(),
      name: dto.name.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone.trim(),
      email: dto.email?.trim() || null,
      address: dto.address?.trim() || null,
    });
  }

  /**
   * Lista los propietarios vinculados a la clínica activa con filtrado y paginación (RF-16).
   */
  public async getOwners(params?: {
    query?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<OwnerResponseDto>> {
    const queryParams = new URLSearchParams();
    if (params?.query) queryParams.set('query', params.query.trim());
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));
    const qs = queryParams.toString();
    return this.apiClient.get<PaginatedResult<OwnerResponseDto>>(`/owners${qs ? `?${qs}` : ''}`);
  }

  /**
   * Consulta el detalle de un propietario por su ID (RF-16).
   */
  public async getOwnerById(id: string): Promise<OwnerResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.get<OwnerResponseDto>(`/owners/${encodedId}`);
  }
}

export const ownersService = new OwnersService();
