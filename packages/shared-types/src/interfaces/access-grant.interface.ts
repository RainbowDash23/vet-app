import { GrantSource, GrantType, GrantScope } from '../enums/grant.enum';

export interface AccessGrantInterface {
  id: string;
  petId: string;
  clinicId: string;
  grantedByUserId?: string | null;
  grantType: GrantType | GrantSource;
  scope: GrantScope;
  expiresAt: string | Date;
  createdAt: string | Date;
}

export type AccessGrantResponseDto = AccessGrantInterface;

export interface CreateAccessGrantDto {
  petId: string;
  clinicId: string;
  grantType?: GrantType | GrantSource;
  scope?: GrantScope;
  durationHours?: number;
}
