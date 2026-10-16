import { Role } from '../enums/role.enum';

export interface LoginRequestDto {
  email: string;
  password: string;
}

export type LoginDto = LoginRequestDto;

export interface RefreshTokenDto {
  refreshToken: string;
}

export type RefreshDto = RefreshTokenDto;

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
  clinicId: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export type JwtPayload = TokenPayload;

export interface AuthUserSummary {
  id: string;
  email: string;
  name: string;
  lastName?: string | null;
  role: Role;
  clinicId: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
  clinicId: string;
}

export interface LogoutResponseDto {
  success: boolean;
  message?: string;
}
