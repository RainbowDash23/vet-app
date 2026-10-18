import type {
  CreateVisitDto,
  CancelVisitDto,
  AttendVisitDto,
  CreateVisitNoteDto,
  VisitResponseDto,
  VisitNoteResponseDto,
  PaginatedResult,
} from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

export interface QueryVisitsParams {
  clinicId?: string;
  vetId?: string;
  date?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Servicio para la gestión de citas y atenciones clínicas en el cliente desktop (RF-39 a RF-42).
 * Consume endpoints de la API de NestJS protegidos por JWT.
 */
export class VisitsService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Consulta paginada de visitas y turnos de la clínica (RF-39).
   * Permite filtrar por veterinario, fecha, clínica o estado.
   */
  public async getVisits(
    params?: QueryVisitsParams,
  ): Promise<PaginatedResult<VisitResponseDto>> {
    const searchParams = new URLSearchParams();

    if (params?.clinicId) {
      searchParams.set('clinicId', params.clinicId);
    }
    if (params?.vetId) {
      searchParams.set('vetId', params.vetId);
    }
    if (params?.date) {
      searchParams.set('date', params.date);
    }
    if (params?.status) {
      searchParams.set('status', params.status);
    }
    if (params?.page) {
      searchParams.set('page', String(params.page));
    }
    if (params?.limit) {
      searchParams.set('limit', String(params.limit));
    }

    const query = searchParams.toString();
    const url = query ? `/visits?${query}` : '/visits';
    return this.apiClient.get<PaginatedResult<VisitResponseDto>>(url);
  }

  /**
   * Consulta el detalle de una visita específica por su identificador.
   */
  public async getVisitById(id: string): Promise<VisitResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.get<VisitResponseDto>(`/visits/${encodedId}`);
  }

  /**
   * Agendamiento de una nueva cita clínica con validación de solapamiento (RF-39, RF-40).
   * Si el backend detecta colisión de horario, arroja HTTP 409 Conflict (ApiError).
   */
  public async scheduleVisit(dto: CreateVisitDto): Promise<VisitResponseDto> {
    return this.apiClient.post<VisitResponseDto>('/visits', dto);
  }

  /**
   * Cancelación de una visita clínica activa suministrando justificación obligatoria (RF-41, RF-42).
   */
  public async cancelVisit(
    id: string,
    dto: CancelVisitDto | { cancellationReason: string },
  ): Promise<VisitResponseDto> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.patch<VisitResponseDto>(`/visits/${encodedId}/cancel`, dto);
  }

  /**
   * Registro de atención médica, anamnesis, constantes vitales y tratamiento (RF-43, RF-44).
   * Envía PATCH /visits/:id/attend.
   */
  public async attendVisit(
    visitId: string,
    dto: AttendVisitDto,
  ): Promise<VisitResponseDto> {
    const encodedId = encodeURIComponent(visitId.trim());
    return this.apiClient.patch<VisitResponseDto>(`/visits/${encodedId}/attend`, dto);
  }

  /**
   * Cierre formal e inmutable de la consulta médica (RF-45).
   * Envía POST /visits/:id/close.
   */
  public async closeVisit(visitId: string): Promise<VisitResponseDto> {
    const encodedId = encodeURIComponent(visitId.trim());
    return this.apiClient.post<VisitResponseDto>(`/visits/${encodedId}/close`, {});
  }

  /**
   * Adición de notas evolutivas complementarias inmutables en visitas cerradas (RF-46).
   * Envía POST /visits/:id/notes.
   */
  public async addVisitNote(
    visitId: string,
    dto: { content: string } | CreateVisitNoteDto,
  ): Promise<VisitNoteResponseDto> {
    const encodedId = encodeURIComponent(visitId.trim());
    return this.apiClient.post<VisitNoteResponseDto>(`/visits/${encodedId}/notes`, dto);
  }

  /**
   * Consulta las notas evolutivas de una visita médica ordenadas cronológicamente (RF-46).
   * Envía GET /visits/:id/notes.
   */
  public async getVisitNotes(visitId: string): Promise<VisitNoteResponseDto[]> {
    const encodedId = encodeURIComponent(visitId.trim());
    return this.apiClient.get<VisitNoteResponseDto[]>(`/visits/${encodedId}/notes`);
  }
}

export const visitsService = new VisitsService();
