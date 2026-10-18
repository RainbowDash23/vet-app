import { Injectable, UnprocessableEntityException } from '@nestjs/common';

export interface VitalsInput {
  weight?: number | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  capillaryRefillTime?: number | null;
}

/**
 * Validador de rangos fisiológicos y biológicos para constantes clínicas (RF-44).
 */
@Injectable()
export class VitalsValidator {
  /**
   * Valida rangos biológicos y fisiológicos para signos vitales veterinarios (RF-44).
   * Lanza UnprocessableEntityException (HTTP 422) si algún valor se encuentra fuera del rango
   * o si valores discretos (frecuencia cardíaca, frecuencia respiratoria, tiempo de llenado capilar) no son enteros.
   */
  validateVitals(vitals: VitalsInput): void {
    if (vitals.weight !== undefined && vitals.weight !== null) {
      if (
        typeof vitals.weight !== 'number' ||
        isNaN(vitals.weight) ||
        vitals.weight < 0.05 ||
        vitals.weight > 150.0
      ) {
        throw new UnprocessableEntityException(
          'El peso debe encontrarse entre 0.05 kg y 150.0 kg',
        );
      }
    }

    if (vitals.temperature !== undefined && vitals.temperature !== null) {
      if (
        typeof vitals.temperature !== 'number' ||
        isNaN(vitals.temperature) ||
        vitals.temperature < 32.0 ||
        vitals.temperature > 43.0
      ) {
        throw new UnprocessableEntityException(
          'La temperatura corporal debe encontrarse entre 32.0 °C y 43.0 °C',
        );
      }
    }

    if (vitals.heartRate !== undefined && vitals.heartRate !== null) {
      if (
        typeof vitals.heartRate !== 'number' ||
        isNaN(vitals.heartRate) ||
        !Number.isInteger(vitals.heartRate) ||
        vitals.heartRate < 30 ||
        vitals.heartRate > 300
      ) {
        throw new UnprocessableEntityException(
          'La frecuencia cardíaca debe encontrarse entre 30 y 300 lpm',
        );
      }
    }

    if (vitals.respiratoryRate !== undefined && vitals.respiratoryRate !== null) {
      if (
        typeof vitals.respiratoryRate !== 'number' ||
        isNaN(vitals.respiratoryRate) ||
        !Number.isInteger(vitals.respiratoryRate) ||
        vitals.respiratoryRate < 10 ||
        vitals.respiratoryRate > 120
      ) {
        throw new UnprocessableEntityException(
          'La frecuencia respiratoria debe encontrarse entre 10 y 120 rpm',
        );
      }
    }

    if (vitals.capillaryRefillTime !== undefined && vitals.capillaryRefillTime !== null) {
      if (
        typeof vitals.capillaryRefillTime !== 'number' ||
        isNaN(vitals.capillaryRefillTime) ||
        !Number.isInteger(vitals.capillaryRefillTime) ||
        vitals.capillaryRefillTime < 1 ||
        vitals.capillaryRefillTime > 5
      ) {
        throw new UnprocessableEntityException(
          'El tiempo de llenado capilar debe encontrarse entre 1 y 5 segundos',
        );
      }
    }
  }
}
