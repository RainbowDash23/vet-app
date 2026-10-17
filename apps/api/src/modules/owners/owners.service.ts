import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Owner, Prisma } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { SearchOwnerQueryDto } from './dto/search-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

/**
 * Servicio para la gestión de dueños en el padrón centralizado (RF-14, RF-15, RF-16, RF-19).
 */
@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un nuevo dueño en el padrón centralizado (RF-14, RF-15).
   * Verifica que no exista un dueño activo con el mismo documento de identidad (RF-15).
   */
  async create(createOwnerDto: CreateOwnerDto): Promise<Owner> {
    const existingOwner = await this.prisma.owner.findFirst({
      where: {
        documentId: createOwnerDto.documentId,
        deletedAt: null,
      },
    });

    if (existingOwner) {
      throw new ConflictException('Documento de identidad ya registrado');
    }

    return this.prisma.owner.create({
      data: {
        documentId: createOwnerDto.documentId,
        name: createOwnerDto.name,
        lastName: createOwnerDto.lastName,
        phone: createOwnerDto.phone,
        email: createOwnerDto.email ?? null,
        address: createOwnerDto.address ?? null,
      },
    });
  }

  /**
   * Búsqueda paginada estándar de dueños activos (RF-16).
   * Permite filtrar por documentId, phone, lastName o búsqueda por término general (query).
   */
  async findAll(queryDto: SearchOwnerQueryDto): Promise<PaginatedResult<Owner>> {
    const page = queryDto.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.OwnerWhereInput = {
      deletedAt: null,
    };

    if (queryDto.documentId) {
      where.documentId = {
        contains: queryDto.documentId,
        mode: 'insensitive',
      };
    }

    if (queryDto.phone) {
      where.phone = {
        contains: queryDto.phone,
      };
    }

    if (queryDto.lastName) {
      where.lastName = {
        contains: queryDto.lastName,
        mode: 'insensitive',
      };
    }

    if (queryDto.query && queryDto.query.trim() !== '') {
      const q = queryDto.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { documentId: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.owner.count({ where }),
      this.prisma.owner.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
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
   * Consulta los datos de un dueño por su identificador único (RF-14).
   * Lanza NotFoundException si no existe o fue eliminado lógicamente.
   */
  async findById(id: string): Promise<Owner> {
    const owner = await this.prisma.owner.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!owner) {
      throw new NotFoundException('Dueño no encontrado');
    }

    return owner;
  }

  /**
   * Actualiza los datos de filiación o contacto de un dueño activo (RF-14).
   * Lanza NotFoundException si no existe o fue eliminado.
   */
  async update(id: string, updateOwnerDto: UpdateOwnerDto): Promise<Owner> {
    await this.findById(id);

    return this.prisma.owner.update({
      where: { id },
      data: {
        ...(updateOwnerDto.name !== undefined && { name: updateOwnerDto.name }),
        ...(updateOwnerDto.lastName !== undefined && { lastName: updateOwnerDto.lastName }),
        ...(updateOwnerDto.phone !== undefined && { phone: updateOwnerDto.phone }),
        ...(updateOwnerDto.email !== undefined && { email: updateOwnerDto.email }),
        ...(updateOwnerDto.address !== undefined && { address: updateOwnerDto.address }),
      },
    });
  }

  /**
   * Inactiva lógicamente un dueño (soft delete) (RF-19).
   * Lanza ConflictException si posee mascotas activas asociadas.
   */
  async softDelete(id: string): Promise<Owner> {
    await this.findById(id);

    const activePetsCount = await this.prisma.pet.count({
      where: {
        ownerId: id,
        deletedAt: null,
      },
    });

    if (activePetsCount > 0) {
      throw new ConflictException('No se puede eliminar un dueño con mascotas asociadas');
    }

    return this.prisma.owner.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
