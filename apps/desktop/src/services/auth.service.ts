import type {
  LoginRequestDto,
  LoginResponseDto,
  LogoutResponseDto,
  RefreshDto,
} from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

export class AuthService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Autenticación con credenciales (RF-1).
   * Al recibir éxito, actualiza tokens en memoria de la sesión segura (RNF-2).
   */
  public async login(
    emailOrDto: string | LoginRequestDto,
    maybePassword?: string,
  ): Promise<LoginResponseDto> {
    const payload: LoginRequestDto =
      typeof emailOrDto === 'string'
        ? { email: emailOrDto, password: maybePassword || '' }
        : emailOrDto;

    const response = await this.apiClient.post<LoginResponseDto>(
      '/auth/login',
      payload,
      { skipAuth: true },
    );

    if (response?.accessToken && response?.refreshToken) {
      this.apiClient.setTokens(response.accessToken, response.refreshToken);
    }

    return response;
  }

  /**
   * Renovación de sesión con rotación de Refresh Token (RF-6).
   */
  public async refresh(refreshToken: string): Promise<LoginResponseDto> {
    const payload: RefreshDto = { refreshToken };
    const response = await this.apiClient.post<LoginResponseDto>(
      '/auth/refresh',
      payload,
      { skipAuth: true },
    );

    if (response?.accessToken && response?.refreshToken) {
      this.apiClient.setTokens(response.accessToken, response.refreshToken);
    }

    return response;
  }

  /**
   * Cierre de sesión y revocación en base de datos (RF-4).
   * Purga tokens locales independientemente de si la API responde con éxito o error de red.
   */
  public async logout(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<LogoutResponseDto> {
    const tokenToRevoke = refreshToken || this.apiClient.getRefreshToken() || undefined;
    const accessHeader = accessToken || this.apiClient.getAccessToken() || undefined;

    try {
      const headers: Record<string, string> = {};
      if (accessHeader) {
        headers['Authorization'] = `Bearer ${accessHeader}`;
      }

      await this.apiClient.post<LogoutResponseDto>(
        '/auth/logout',
        tokenToRevoke ? { refreshToken: tokenToRevoke } : {},
        { headers, skipAuth: !accessHeader },
      );
    } catch (err) {
      console.warn('[AuthService] Advertencia al cerrar sesión en servidor:', err);
    } finally {
      this.apiClient.clearTokens();
    }

    return {
      success: true,
      message: 'Sesión cerrada exitosamente',
    };
  }
}

export const authService = new AuthService();
