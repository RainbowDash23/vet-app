import type { Role, UpdateUserDto } from '@vet-app/shared-types';
import { ApiClient, apiClient as defaultApiClient } from './api.client';

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: Role;
  licenseNumber?: string | null;
  specialty?: string | null;
  phone?: string | null;
}

export interface UserItem {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  role: Role;
  licenseNumber: string | null;
  specialty: string | null;
  phone: string | null;
  createdAt: string;
}

export class UsersService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient = defaultApiClient) {
    this.apiClient = apiClient;
  }

  public async createUser(data: CreateUserData): Promise<UserItem> {
    return this.apiClient.post<UserItem>('/users', data);
  }

  public async getUsers(): Promise<UserItem[]> {
    return this.apiClient.get<UserItem[]>('/users');
  }

  public async updateUser(id: string, data: UpdateUserDto): Promise<UserItem> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.patch<UserItem>(`/users/${encodedId}`, data);
  }

  public async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    const encodedId = encodeURIComponent(id.trim());
    return this.apiClient.delete<{ success: boolean; message: string }>(`/users/${encodedId}`);
  }
}

export const usersService = new UsersService();
