export interface CreateOwnerDto {
  documentId: string;
  name: string;
  lastName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
}

export interface UpdateOwnerDto {
  name?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
}

export interface SearchOwnerQueryDto {
  documentId?: string;
  phone?: string;
  lastName?: string;
  query?: string;
  page?: number;
  limit?: number;
}

export interface OwnerResponseDto {
  id: string;
  documentId: string;
  name: string;
  lastName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}
