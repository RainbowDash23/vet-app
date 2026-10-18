import { Injectable } from '@nestjs/common';

export interface ExistingVisitSlot {
  scheduledDate: Date | string;
  durationMinutes: number;
}

/**
 * Validador algorítmico contra solapamientos de turnos clínicos (RF-40).
 * Evalúa matemáticamente la colisión de intervalos semiabiertos [start, end):
 *   newStart < existingEnd && newEnd > existingStart
 * donde end = start + durationMinutes * 60000.
 */
@Injectable()
export class CollisionValidator {
  /**
   * Determina estáticamente si un nuevo turno temporal presenta solapamiento
   * con alguna visita activa previamente agendada para el mismo veterinario.
   */
  static hasCollision(
    newStart: Date | string,
    newDurationMinutes: number,
    existingVisits: ExistingVisitSlot[],
  ): boolean {
    if (!existingVisits || existingVisits.length === 0) {
      return false;
    }

    const newStartMs = new Date(newStart).getTime();
    const newEndMs = newStartMs + newDurationMinutes * 60 * 1000;

    for (const visit of existingVisits) {
      const existingStartMs = new Date(visit.scheduledDate).getTime();
      const existingEndMs = existingStartMs + visit.durationMinutes * 60 * 1000;

      // Condición algorítmica de solapamiento estricto de intervalos
      if (newStartMs < existingEndMs && newEndMs > existingStartMs) {
        return true;
      }
    }

    return false;
  }

  /**
   * Método de instancia para inyección de dependencias en NestJS.
   */
  hasCollision(
    newStart: Date | string,
    newDurationMinutes: number,
    existingVisits: ExistingVisitSlot[],
  ): boolean {
    return CollisionValidator.hasCollision(newStart, newDurationMinutes, existingVisits);
  }
}
