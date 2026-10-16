import { Role } from '../enums/role.enum';

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  lastName?: string | null;
  role: Role;
  licenseNumber?: string | null;
  specialty?: string | null;
  phone?: string | null;
}

export interface UpdateUserDto {
  name?: string;
  lastName?: string | null;
  licenseNumber?: string | null;
  specialty?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  lastName?: string | null;
  role: Role;
  clinicId: string;
  licenseNumber?: string | null;
  specialty?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}
