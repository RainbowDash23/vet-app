import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  clinicId: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  clinicId: string;
}
