import type { Role } from '@vet-app/shared-types';
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
}

export const usersService = new UsersService();
