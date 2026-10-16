export interface CreateClinicDto {
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface UpdateClinicDto {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface ClinicResponseDto {
  id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}
