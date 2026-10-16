import { UserResponseDto } from './user.dto';

export interface CreateVisitNoteDto {
  note: string;
}

export interface VisitNoteResponseDto {
  id: string;
  visitId: string;
  vetId: string;
  note: string;
  createdAt: string | Date;
  veterinarian?: UserResponseDto;
}
