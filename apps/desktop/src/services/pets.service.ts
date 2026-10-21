import type {
  PetResponseDto,
  CreatePetDto,
  PaginatedResult,
  ResolveTagResponseDto,
  VisitResponseDto,
} from '@vet-app/shared-types';
import { ApiClient, ApiError, apiClient as defaultApiClient } from './api.client';

export interface VaccinationRecord {
  id: string;
  petId: string;
  clinicId?: string | null;
  vetId?: string | null;
  vaccineName: string;
  batchNumber?: string | null;
  appliedAt: string | Date;
  nextDueDate?: string | Date | null;
  notes?: string | null;
  deletedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  clinic?: { id: string; name: string } | null;
  veterinarian?: { id: string; name: string } | null;
}

/**
 * Servicio para la gestión de mascotas, tags y expediente clínico en el cliente desktop.
 * Consume endpoints de la API de NestJS protegidos por JWT.
 */
export class PetsService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Resuelve el identificador físico de un tag NFC escaneado (RF-28, RF-29).
   * Si el tag existe y está activo, retorna la ficha del paciente (completa o mínima) y el estado de consentimiento.
   * Si el tag no está registrado (HTTP 404), captura la respuesta y retorna `{ registered: false, uid }`.
   */
  public async resolveTag(uid: string): Promise<ResolveTagResponseDto> {
    const encodedUid = encodeURIComponent(uid.trim());
    try {
      return await this.apiClient.get<ResolveTagResponseDto>(`/tags/resolve/${encodedUid}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const errorData = error.data as { registered?: boolean; uid?: string } | undefined;
        return {
          registered: false,
          uid: errorData?.uid ?? uid,
        };
      }
      throw error;
    }
  }

  /**
   * Consulta el detalle de una mascota activa por su ID (RF-17).
   */
  public async getPetById(id: string): Promise<PetResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.get<PetResponseDto>(`/pets/${encodedId}`);
  }

  /**
   * Consulta el historial médico cronológico de visitas de una mascota (RF-23, RF-47).
   */
  public async getMedicalHistory(
    petId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<VisitResponseDto>> {
    const encodedPetId = encodeURIComponent(petId.trim());
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return this.apiClient.get<PaginatedResult<VisitResponseDto>>(
      `/visits/history/pet/${encodedPetId}?${params.toString()}`,
    );
  }

  /**
   * Consulta el carnet de vacunación y refuerzos de una mascota (RF-48).
   */
  public async getVaccinations(
    petId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<VaccinationRecord>> {
    const encodedPetId = encodeURIComponent(petId.trim());
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return this.apiClient.get<PaginatedResult<VaccinationRecord>>(
      `/vaccinations/pet/${encodedPetId}?${params.toString()}`,
    );
  }

  /**
   * Crea una nueva mascota asociada a un propietario existente (RF-17).
   */
  public async createPet(dto: CreatePetDto): Promise<PetResponseDto> {
    return this.apiClient.post<PetResponseDto>('/pets', dto);
  }

  /**
   * Vincula un transpondedor físico libre a una mascota registrada (RF-30).
   * Lanza ApiError con status 409 si el UID o la mascota ya posee un tag activo (RF-31).
   */
  public async assignTag(dto: { uid: string; petId: string }): Promise<any> {
    return this.apiClient.post<any>('/tags/assign', dto);
  }

  /**
   * Busca mascotas activas en el padrón centralizado mediante término de búsqueda general (RF-30).
   */
  public async searchPets(query: string): Promise<PaginatedResult<PetResponseDto>> {
    const params = new URLSearchParams({
      query: query.trim(),
    });
    return this.apiClient.get<PaginatedResult<PetResponseDto>>(`/pets?${params.toString()}`);
  }

  /**
   * Consulta el listado de mascotas con parámetros de filtrado y paginación.
   */
  public async getPets(params?: {
    query?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<PetResponseDto>> {
    const queryParams = new URLSearchParams();
    if (params?.query) queryParams.set('query', params.query.trim());
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));
    const qs = queryParams.toString();
    return this.apiClient.get<PaginatedResult<PetResponseDto>>(`/pets${qs ? `?${qs}` : ''}`);
  }
}

export const petsService = new PetsService();
