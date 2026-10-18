/**
 * Cliente HTTP con inyección automática de JWT, almacenamiento seguro en memoria (RNF-2)
 * y renovación atómica de sesión con rotación de Refresh Token (RF-6).
 */

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  // Tokens almacenados estrictamente en memoria (RNF-2: cero secretos en disco)
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  // Mutex para evitar refrescos concurrentes redundantes
  private refreshPromise: Promise<string | null> | null = null;

  // Suscriptores de desautenticación / expiración de sesión
  private readonly unauthorizedListeners: Set<() => void> = new Set();

  constructor(options?: ApiClientOptions) {
    const nodeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    const defaultUrl =
      typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL
        ? (import.meta as any).env.VITE_API_URL
        : typeof nodeProcess !== 'undefined' && nodeProcess.env?.VITE_API_URL
          ? nodeProcess.env.VITE_API_URL
          : 'http://localhost:3000';

    this.baseUrl = (options?.baseUrl || defaultUrl).replace(/\/$/, '');
    this.fetchFn = options?.fetchFn || globalThis.fetch.bind(globalThis);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  public onUnauthorized(callback: () => void): () => void {
    this.unauthorizedListeners.add(callback);
    return () => {
      this.unauthorizedListeners.delete(callback);
    };
  }

  private notifyUnauthorized(): void {
    for (const listener of this.unauthorizedListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[ApiClient] Error en listener de unauthorized:', err);
      }
    }
  }

  /**
   * Ejecuta el refresco de tokens de forma atómica.
   * Si ya hay un refresco en curso, las peticiones concurrentes esperan la misma promesa.
   */
  private async executeAtomicRefresh(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.refreshToken) {
      this.clearTokens();
      this.notifyUnauthorized();
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshUrl = `${this.baseUrl}/auth/refresh`;
        const response = await this.fetchFn(refreshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (!response.ok) {
          this.clearTokens();
          this.notifyUnauthorized();
          return null;
        }

        const data = await response.json();
        const newAccessToken = data.accessToken;
        const newRefreshToken = data.refreshToken || this.refreshToken;

        if (newAccessToken) {
          this.setTokens(newAccessToken, newRefreshToken);
          return newAccessToken;
        }

        this.clearTokens();
        this.notifyUnauthorized();
        return null;
      } catch {
        this.clearTokens();
        this.notifyUnauthorized();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Realiza una petición HTTP gestionando autenticación, cabeceras y captura de 401.
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {},
    isRetry = false,
  ): Promise<T> {
    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = new Headers(options.headers);

    // Inyectar Content-Type json si hay body y no es FormData
    if (
      options.body &&
      typeof options.body === 'string' &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }

    // Inyectar Authorization si existe accessToken y no se omite auth
    if (this.accessToken && !options.skipAuth && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    const response = await this.fetchFn(url, {
      ...options,
      headers,
    });

    // Captura de 401 Unauthorized para refresco automático (RF-6)
    if (response.status === 401 && !options.skipAuth) {
      const isAuthEndpoint =
        url.endsWith('/auth/refresh') ||
        url.endsWith('/auth/login') ||
        url.endsWith('/auth/logout');

      if (!isRetry && !isAuthEndpoint) {
        const newAccessToken = await this.executeAtomicRefresh();
        if (newAccessToken) {
          // Reintentar la petición original con el nuevo token
          const retryHeaders = new Headers(options.headers);
          retryHeaders.set('Authorization', `Bearer ${newAccessToken}`);
          return this.request<T>(
            endpoint,
            {
              ...options,
              headers: retryHeaders,
            },
            true,
          );
        }
      }

      // Si el refresco falló o era endpoint de auth
      this.clearTokens();
      this.notifyUnauthorized();
      throw new ApiError('Sesión no autorizada o expirada (401)', 401);
    }

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;

      try {
        const json = await response.json();
        errorData = json;
        if (json && typeof json === 'object' && 'message' in json) {
          errorMessage = Array.isArray(json.message)
            ? json.message.join(', ')
            : String(json.message);
        }
      } catch {
        try {
          const text = await response.text();
          if (text) errorMessage = text;
        } catch {
          // No content
        }
      }

      throw new ApiError(errorMessage, response.status, errorData);
    }

    // Respuesta 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  public async get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  public async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  public async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  public async delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
