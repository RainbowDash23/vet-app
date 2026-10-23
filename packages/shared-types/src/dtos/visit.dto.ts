import { VisitStatus } from '../enums/visit-status.enum';
import { UserResponseDto } from './user.dto';
import { PetResponseDto } from './pet.dto';
import { VisitNoteResponseDto } from './visit-note.dto';

export interface CreateVisitDto {
  vetId: string;
  petId: string;
  reason: string;
  startTime: string | Date;
  scheduledDate?: string | Date;
  durationMinutes?: number;
  notes?: string | null;
}

export interface RescheduleVisitDto {
  startTime: string | Date;
  durationMinutes?: number;
}

export interface CancelVisitDto {
  cancellationReason: string;
}

export interface AttendVisitDto {
  diagnosis?: string;
  treatment?: string;
  notes?: string;
  weight?: number;
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  capillaryRefillTime?: number;
}

export interface CloseVisitDto {
  diagnosis: string;
  treatment: string;
  notes?: string;
}

export interface VisitResponseDto {
  id: string;
  clinicId: string;
  vetId: string;
  petId: string;
  reason: string;
  notes?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  weight?: number | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  capillaryRefillTime?: number | null;
  startTime: string | Date;
  durationMinutes: number;
  endTime: string | Date;
  status: VisitStatus;
  cancellationReason?: string | null;
  closedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  veterinarian?: UserResponseDto;
  pet?: PetResponseDto;
  visitNotes?: VisitNoteResponseDto[];
}
