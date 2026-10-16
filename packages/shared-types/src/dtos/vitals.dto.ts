export const VITALS_LIMITS = {
  WEIGHT: { MIN: 0.05, MAX: 150.0 },
  TEMPERATURE: { MIN: 32.0, MAX: 43.0 },
  HEART_RATE: { MIN: 30, MAX: 300 },
  RESPIRATORY_RATE: { MIN: 10, MAX: 120 },
  CAPILLARY_REFILL_TIME: { MIN: 1, MAX: 5 },
} as const;

export interface RecordVitalsDto {
  weight?: number | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  capillaryRefillTime?: number | null;
}
