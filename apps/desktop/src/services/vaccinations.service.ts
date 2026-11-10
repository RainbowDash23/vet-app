import type {
  CreateVaccinationDto,
  QueryVaccinationDto,
  VaccinationResponseDto,
  PaginatedResult,
} from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

/**
 * Servicio para el registro y consulta de aplicaciones biológicas/vacunación (RF-48, RF-21, RNF-8).
 */
export class VaccinationsService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Registro de una nueva aplicación biológica por el profesional veterinario (RF-48).
   */
  public async createVaccination(dto: CreateVaccinationDto): Promise<VaccinationResponseDto> {
    return this.apiClient.post<VaccinationResponseDto>('/vaccinations', dto);
  }

  /**
   * Consulta del carnet de vacunación de una mascota (RF-48).
   */
  public async getVaccinationsByPet(
    petId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<VaccinationResponseDto>> {
    const encodedPetId = encodeURIComponent(petId.trim());
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return this.apiClient.get<PaginatedResult<VaccinationResponseDto>>(
      `/vaccinations/pet/${encodedPetId}?${params.toString()}`,
    );
  }

  /**
   * Lista general de vacunaciones registradas en la clínica.
   */
  public async getVaccinations(
    query?: QueryVaccinationDto,
  ): Promise<PaginatedResult<VaccinationResponseDto>> {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.petId) params.set('petId', query.petId);
    const qs = params.toString();
    return this.apiClient.get<PaginatedResult<VaccinationResponseDto>>(
      `/vaccinations${qs ? `?${qs}` : ''}`,
    );
  }

  /**
   * Consulta el detalle de una vacunación por su identificador.
   */
  public async getVaccinationById(id: string): Promise<VaccinationResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.get<VaccinationResponseDto>(`/vaccinations/${encodedId}`);
  }
}

export const vaccinationsService = new VaccinationsService();
