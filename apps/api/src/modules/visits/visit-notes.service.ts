import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VisitNote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVisitNoteDto } from './dto/create-visit-note.dto';

/**
 * Servicio de gestión de notas evolutivas complementarias inmutables (VisitNote).
 * Cumple con RF-46 (inmutabilidad estricta append-only sin métodos de modificación o eliminación).
 */
@Injectable()
export class VisitNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una nueva nota evolutiva complementaria inmutable vinculada a una visita cerrada (RF-46).
   *
   * @param clinicId Identificador de la clínica autenticada (multi-tenant)
   * @param visitId Identificador único de la visita médica
   * @param vetId Identificador del veterinario autor
   * @param createNoteDto Carga útil conteniendo el contenido textual de la nota
   */
  async createNote(
    clinicId: string,
    visitId: string,
    vetId: string,
    createNoteDto: CreateVisitNoteDto,
  ): Promise<VisitNote> {
    // 1. Busca la visita asegurando clinicId y deletedAt === null.
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!visit) {
      throw new NotFoundException('Visita médica no encontrada o inactiva');
    }

    // 2. Comprueba que la visita esté cerrada formalmente (closedAt !== null) (RF-46).
    if (visit.closedAt === null) {
      throw new ConflictException(
        'Solo se pueden registrar notas evolutivas complementarias sobre visitas médicas cerradas',
      );
    }

    // 3. Persiste en Prisma en la tabla visit_notes (RF-46).
    return this.prisma.visitNote.create({
      data: {
        visitId,
        vetId,
        content: createNoteDto.content.trim(),
        createdAt: new Date(),
      },
      include: {
        veterinarian: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            licenseNumber: true,
          },
        },
      },
    });
  }

  /**
   * Consulta y lista las notas evolutivas de una visita médica ordenadas por createdAt asc (RF-46).
   *
   * @param visitId Identificador de la visita
   */
  async findByVisitId(visitId: string): Promise<VisitNote[]> {
    return this.prisma.visitNote.findMany({
      where: {
        visitId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        veterinarian: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            licenseNumber: true,
          },
        },
      },
    });
  }
}
