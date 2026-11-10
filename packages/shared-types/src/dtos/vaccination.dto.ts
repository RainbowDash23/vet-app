export interface CreateVaccinationDto {
  petId: string;
  vaccineName: string;
  batchNumber?: string | null;
  appliedAt?: string | Date;
  nextDueDate?: string | Date | null;
  notes?: string | null;
}

export interface QueryVaccinationDto {
  page?: number;
  limit?: number;
  petId?: string;
}

export interface VaccinationResponseDto {
  id: string;
  petId: string;
  clinicId?: string | null;
  vetId?: string | null;
  vaccineName: string;
  batchNumber?: string | null;
  appliedAt: string | Date;
  nextDueDate?: string | Date | null;
  notes?: string | null;
  deletedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  clinic?: { id: string; name: string } | null;
  veterinarian?: { id: string; name: string } | null;
}
