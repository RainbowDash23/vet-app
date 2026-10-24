import { TagStatus } from '../enums/tag-status.enum';
import { PetResponseDto, PetMinimalFiliationDto } from './pet.dto';
import { AccessGrantInterface } from '../interfaces/access-grant.interface';

export interface AssignTagDto {
  uid: string;
  petId: string;
}

export interface ReportTagStatusDto {
  status: TagStatus;
}

export interface TagResponseDto {
  id: string;
  uid: string;
  publicCode: string;
  status: TagStatus;
  petId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ResolveTagSuccessDto {
  registered: true;
  uid: string;
  pet: PetResponseDto | PetMinimalFiliationDto;
  hasFullAccess: boolean;
  grant?: AccessGrantInterface | null;
  tag?: TagResponseDto | null;
  publicCode?: string;
}

export interface ResolveTagUnregisteredDto {
  registered: false;
  uid: string;
}

export type ResolveTagResponseDto = ResolveTagSuccessDto | ResolveTagUnregisteredDto;
