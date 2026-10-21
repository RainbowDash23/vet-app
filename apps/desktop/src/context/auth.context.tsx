import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Role } from '@vet-app/shared-types';
import type { AuthUserSummary } from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from '../services/api.client';
import { AuthService, authService as defaultAuthService } from '../services/auth.service';

export interface AuthContextValue {
  user: AuthUserSummary | null;
  role: Role | null;
  clinicId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  clearError: () => void;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: AuthUserSummary | null;
  initialTokens?: { accessToken: string; refreshToken: string };
  authServiceInstance?: AuthService;
  apiClientInstance?: ApiClient;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialUser = null,
  initialTokens,
  authServiceInstance,
  apiClientInstance,
}) => {
  const apiClient = apiClientInstance || defaultApiClient;
  const authService = authServiceInstance || (apiClientInstance ? new AuthService(apiClientInstance) : defaultAuthService);

  // Inicialización de tokens en memoria si se proveen
  if (initialTokens) {
    apiClient.setTokens(initialTokens.accessToken, initialTokens.refreshToken);
  }

  const [user, setUser] = useState<AuthUserSummary | null>(initialUser);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const role = user?.role ?? null;
  const clinicId = user?.clinicId ?? null;
  const isAuthenticated = Boolean(user);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
    } catch (err) {
      console.warn('[AuthProvider] Error en cierre de sesión:', err);
    } finally {
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  }, [authService]);

  // Manejo de eventos de sesión revocada o 401 sin refresh (RF-4)
  useEffect(() => {
    const unsubscribe = apiClient.onUnauthorized(() => {
      setUser(null);
      setError('Sesión expirada o no autorizada. Por favor ingresa nuevamente.');
    });
    return unsubscribe;
  }, [apiClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authService.login(email, password);
        const resolvedUser: AuthUserSummary = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          lastName: response.user.lastName ?? null,
          role: response.user.role,
          clinicId: response.clinicId || response.user.clinicId,
        };
        setUser(resolvedUser);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Error de autenticación. Verifica tus credenciales.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [authService],
  );

  const refreshSession = useCallback(async () => {
    const currentRefresh = apiClient.getRefreshToken();
    if (!currentRefresh) {
      await logout();
      return;
    }
    setIsLoading(true);
    try {
      const response = await authService.refresh(currentRefresh);
      const resolvedUser: AuthUserSummary = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        lastName: response.user.lastName ?? null,
        role: response.user.role,
        clinicId: response.clinicId || response.user.clinicId,
      };
      setUser(resolvedUser);
    } catch {
      await logout();
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, authService, logout]);

  const hasRole = useCallback(
    (...roles: Role[]): boolean => {
      if (!user || !user.role) return false;
      return roles.includes(user.role);
    },
    [user],
  );

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      clinicId,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshSession,
      hasRole,
      clearError,
    }),
    [
      user,
      role,
      clinicId,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshSession,
      hasRole,
      clearError,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
