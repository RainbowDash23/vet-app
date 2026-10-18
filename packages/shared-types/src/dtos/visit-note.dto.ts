import { UserResponseDto } from './user.dto';

export interface CreateVisitNoteDto {
  content: string;
  note?: string;
}

export interface VisitNoteResponseDto {
  id: string;
  visitId: string;
  vetId: string;
  content: string;
  note?: string;
  createdAt: string | Date;
  veterinarian?: UserResponseDto;
}
