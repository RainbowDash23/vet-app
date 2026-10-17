import { Injectable } from '@nestjs/common';
import { AccessLog, Prisma } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessLogDto } from './dto/create-access-log.dto';
import { QueryAccessLogDto } from './dto/query-access-log.dto';

/**
 * Servicio de bitácora de auditoría inmutable de solo inserción (RNF-7).
 * Registra de forma atómica y secuencial cada consulta realizada sobre la información de una mascota (RF-25, RF-37).
 * Carece intencionalmente de cualquier método de modificación o eliminación (update, delete, softDelete, patch).
 */
@Injectable()
export class AccessLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserta de forma atómica y secuencial una nueva traza de auditoría en access_logs (RF-25, RF-37).
   * Permite que clinicId y userId sean null o undefined (para accesos públicos de emergencia).
   *
   * @param createDto Datos de la traza de auditoría a registrar.
   * @returns La entidad AccessLog persistida.
   */
  async log(createDto: CreateAccessLogDto): Promise<AccessLog> {
    return this.prisma.accessLog.create({
      data: {
        petId: createDto.petId,
        clinicId: createDto.clinicId ?? null,
        userId: createDto.userId ?? null,
        action: createDto.action,
        ipAddress: createDto.ipAddress ?? null,
        userAgent: createDto.userAgent ?? null,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Consulta paginada y filtrado de trazas de auditoría ordenada descendentemente por marca temporal (RF-25).
   *
   * @param queryDto Filtros de búsqueda (petId, clinicId, userId, action) y parámetros de paginación.
   * @returns Colección paginada estandarizada con datos y metadatos de paginación.
   */
  async findAll(queryDto: QueryAccessLogDto): Promise<PaginatedResult<AccessLog>> {
    const page = queryDto.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.AccessLogWhereInput = {};

    if (queryDto.petId) {
      where.petId = queryDto.petId;
    }

    if (queryDto.clinicId) {
      where.clinicId = queryDto.clinicId;
    }

    if (queryDto.userId) {
      where.userId = queryDto.userId;
    }

    if (queryDto.action) {
      where.action = queryDto.action;
    }

    const [total, data] = await Promise.all([
      this.prisma.accessLog.count({ where }),
      this.prisma.accessLog.findMany({
        where,
        skip,
        take,
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1 && totalPages > 0;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  /**
   * Retorna el historial cronológico de accesos de una mascota específica ordenado descendentemente (RF-25).
   *
   * @param petId Identificador UUID de la mascota.
   * @param page Número de página (por defecto 1).
   * @param limit Cantidad de registros por página (por defecto 10).
   * @returns Colección paginada de trazas de la mascota.
   */
  async findByPetId(
    petId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<AccessLog>> {
    return this.findAll({
      petId,
      page,
      limit,
    });
  }
}
