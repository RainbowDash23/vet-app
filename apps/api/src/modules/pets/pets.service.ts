import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pet, PetSex, Prisma, ReproductiveStatus, TagStatus } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { SearchPetQueryDto } from './dto/search-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

/**
 * Servicio para la gestión de mascotas en el padrón centralizado (RF-17 a RF-20).
 */
@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una nueva mascota vinculada a un dueño (RF-17).
   * Verifica la existencia y estado activo del dueño asociado (RF-18).
   */
  async create(createPetDto: CreatePetDto): Promise<Pet> {
    const owner = await this.prisma.owner.findFirst({
      where: {
        id: createPetDto.ownerId,
        deletedAt: null,
      },
    });

    if (!owner) {
      throw new NotFoundException('Dueño no encontrado o inactivo');
    }

    return this.prisma.pet.create({
      data: {
        name: createPetDto.name,
        species: createPetDto.species,
        breed: createPetDto.breed ?? null,
        sex: createPetDto.sex ?? PetSex.UNKNOWN,
        birthDate: createPetDto.birthDate ? new Date(createPetDto.birthDate) : null,
        isApproximateBirthDate: createPetDto.isApproximateBirthDate ?? false,
        color: createPetDto.color ?? null,
        reproductiveStatus: createPetDto.reproductiveStatus ?? ReproductiveStatus.UNKNOWN,
        notes: createPetDto.notes ?? null,
        ownerId: createPetDto.ownerId,
      },
    });
  }

  /**
   * Búsqueda y listado paginado estándar de mascotas activas (deletedAt: null).
   * Permite filtrar por ownerId, species o término de búsqueda (query).
   */
  async findAll(queryDto: SearchPetQueryDto): Promise<PaginatedResult<Pet>> {
    const page = queryDto.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.PetWhereInput = {
      deletedAt: null,
    };

    if (queryDto.ownerId) {
      where.ownerId = queryDto.ownerId;
    }

    if (queryDto.species) {
      where.species = queryDto.species;
    }

    if (queryDto.query && queryDto.query.trim() !== '') {
      const q = queryDto.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { breed: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.pet.count({ where }),
      this.prisma.pet.findMany({
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
   * Consulta el detalle de una mascota activa por su identificador (RF-17).
   * Incluye datos del dueño y tags asociados no eliminados.
   * Lanza NotFoundException si no existe o presenta borrado lógico.
   */
  async findById(id: string): Promise<Pet> {
    const pet = await this.prisma.pet.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        owner: true,
        tags: {
          where: { deletedAt: null },
        },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    return pet;
  }

  /**
   * Actualiza los atributos de una mascota activa.
   * Si se incluye ownerId, valida que el nuevo dueño exista y esté activo.
   */
  async update(id: string, updatePetDto: UpdatePetDto): Promise<Pet> {
    await this.findById(id);

    if (updatePetDto.ownerId) {
      const owner = await this.prisma.owner.findFirst({
        where: {
          id: updatePetDto.ownerId,
          deletedAt: null,
        },
      });

      if (!owner) {
        throw new NotFoundException('Dueño no encontrado o inactivo');
      }
    }

    return this.prisma.pet.update({
      where: { id },
      data: {
        ...(updatePetDto.name !== undefined && { name: updatePetDto.name }),
        ...(updatePetDto.species !== undefined && { species: updatePetDto.species }),
        ...(updatePetDto.breed !== undefined && { breed: updatePetDto.breed }),
        ...(updatePetDto.sex !== undefined && { sex: updatePetDto.sex }),
        ...(updatePetDto.birthDate !== undefined && {
          birthDate: updatePetDto.birthDate ? new Date(updatePetDto.birthDate) : null,
        }),
        ...(updatePetDto.isApproximateBirthDate !== undefined && {
          isApproximateBirthDate: updatePetDto.isApproximateBirthDate,
        }),
        ...(updatePetDto.color !== undefined && { color: updatePetDto.color }),
        ...(updatePetDto.reproductiveStatus !== undefined && {
          reproductiveStatus: updatePetDto.reproductiveStatus,
        }),
        ...(updatePetDto.notes !== undefined && { notes: updatePetDto.notes }),
        ...(updatePetDto.ownerId !== undefined && { ownerId: updatePetDto.ownerId }),
      },
    });
  }

  /**
   * Inactiva lógicamente una mascota (soft delete) (RF-19, RF-20).
   * Evalúa integridad referencial: bloquea con ConflictException si posee visitas clínicas registradas (RF-19).
   * Ejecuta una transacción atómica para marcar deletedAt y conmutar tags activos a INACTIVE (RF-20).
   */
  async softDelete(id: string): Promise<Pet> {
    await this.findById(id);

    const visitsCount = await this.prisma.visit.count({
      where: {
        petId: id,
      },
    });

    if (visitsCount > 0) {
      throw new ConflictException(
        'No se puede eliminar una mascota con visitas clínicas registradas',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedPet = await tx.pet.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.tag.updateMany({
        where: {
          petId: id,
          status: TagStatus.ACTIVE,
        },
        data: {
          status: TagStatus.INACTIVE,
        },
      });

      return deletedPet;
    });
  }
}
