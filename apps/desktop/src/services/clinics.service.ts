import type {
  ClinicResponseDto,
  UpdateClinicDto,
} from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

/**
 * Servicio para la gestión y configuración institucional de la clínica (RF-7, RF-9, RF-63).
 */
export class ClinicsService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Obtiene los datos institucionales de la clínica a la que pertenece el usuario autenticado (RF-9, RNF-8).
   */
  public async getCurrentClinic(): Promise<ClinicResponseDto> {
    return this.apiClient.get<ClinicResponseDto>('/clinics/current');
  }

  /**
   * Actualiza los datos institucionales de la clínica actual (RF-7, RF-9, RF-63).
   * Restringido exclusivamente al rol ADMIN.
   */
  public async updateCurrentClinic(dto: UpdateClinicDto): Promise<ClinicResponseDto> {
    return this.apiClient.patch<ClinicResponseDto>('/clinics/current', dto);
  }

  /**
   * Consulta los datos de una clínica por su identificador único (RF-63).
   */
  public async getClinicById(id: string): Promise<ClinicResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.get<ClinicResponseDto>(`/clinics/${encodedId}`);
  }

  /**
   * Actualiza los datos de una clínica por su ID (RF-63).
   */
  public async updateClinic(id: string, dto: UpdateClinicDto): Promise<ClinicResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.patch<ClinicResponseDto>(`/clinics/${encodedId}`, dto);
  }
}

export const clinicsService = new ClinicsService();
