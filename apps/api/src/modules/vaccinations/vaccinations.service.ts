import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GrantScope, Prisma, Vaccination } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessGrantsService } from '../pets/access-grants.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { QueryVaccinationDto } from './dto/query-vaccination.dto';

export type VaccinationWithRelations = Vaccination & {
  pet?: any;
  veterinarian?: any;
  clinic?: any;
};

/**
 * Servicio de gestión de aplicaciones biológicas, vacunas y alertas de refuerzo (RF-48, RF-21, RNF-8).
 */
@Injectable()
export class VaccinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessGrantsService: AccessGrantsService,
  ) {}

  /**
   * Registra una nueva aplicación biológica validando la existencia de la mascota,
   * consistencia temporal entre fecha de aplicación y fecha del próximo refuerzo (RF-48).
   */
  async create(
    clinicId: string,
    vetId: string,
    createDto: CreateVaccinationDto,
  ): Promise<VaccinationWithRelations> {
    // 1. Valida que la mascota exista, esté activa (deletedAt === null) y autorizada para la clínica (RF-63)
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: createDto.petId,
        deletedAt: null,
      },
      include: {
        visits: { where: { deletedAt: null } },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada o inactiva');
    }

    const isOrigin = pet.createdByClinicId === clinicId;
    const hasVisitsInClinic = pet.visits?.some((v: any) => v.clinicId === clinicId);
    const hasGrant = await this.accessGrantsService.hasActiveGrant(
      createDto.petId,
      clinicId,
      GrantScope.VACCINES_ONLY,
    );

    if (!isOrigin && !hasVisitsInClinic && !hasGrant) {
      throw new NotFoundException('Mascota no encontrada o no autorizada');
    }

    // 2. Valida coherencia cronológica de nextDueDate vs appliedAt
    const appliedDate = createDto.appliedAt
      ? new Date(createDto.appliedAt)
      : new Date();

    let nextDueDate: Date | null = null;
    if (createDto.nextDueDate) {
      nextDueDate = new Date(createDto.nextDueDate);
      if (nextDueDate.getTime() <= appliedDate.getTime()) {
        throw new BadRequestException(
          'La fecha del próximo refuerzo debe ser posterior a la fecha de aplicación',
        );
      }
    }

    // 3. Persiste el registro biológico en Prisma
    return this.prisma.vaccination.create({
      data: {
        petId: createDto.petId,
        clinicId,
        vetId,
        vaccineName: createDto.vaccineName.trim(),
        batchNumber: createDto.batchNumber?.trim() || null,
        appliedAt: appliedDate,
        nextDueDate,
        notes: createDto.notes?.trim() || createDto.notes || null,
      },
      include: {
        pet: true,
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
   * Consulta las aplicaciones biológicas de una mascota protegida por AccessGrant vigente (RF-48, RF-21, RNF-8).
   * Requiere consentimiento activo con alcance al menos VACCINES_ONLY.
   */
  async findByPetId(
    petId: string,
    clinicId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<Vaccination>> {
    // 1. Valida la vigencia de AccessGrant a favor de clinicId con alcance al menos VACCINES_ONLY (RF-21, RF-48, RNF-8)
    const hasGrant = await this.accessGrantsService.hasActiveGrant(
      petId,
      clinicId,
      GrantScope.VACCINES_ONLY,
    );

    if (!hasGrant) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar las vacunaciones de este paciente',
      );
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.VaccinationWhereInput = {
      petId,
      deletedAt: null,
    };

    const [total, data] = await Promise.all([
      this.prisma.vaccination.count({ where }),
      this.prisma.vaccination.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: {
          appliedAt: 'desc',
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
          clinic: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
    ]);

    const totalPages = limitNumber > 0 ? Math.ceil(total / limitNumber) : (total > 0 ? 1 : 0);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1 && totalPages > 0;

    return {
      data,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  /**
   * Consulta general de vacunaciones aplicadas en la clínica con soporte de paginación.
   */
  async findAll(
    clinicId: string,
    queryDto?: QueryVaccinationDto,
  ): Promise<PaginatedResult<Vaccination>> {
    const pageNumber = Math.max(1, Number(queryDto?.page) || 1);
    const limitNumber = Math.max(1, Math.min(100, Number(queryDto?.limit) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.VaccinationWhereInput = {
      clinicId,
      deletedAt: null,
    };

    if (queryDto?.petId) {
      where.petId = queryDto.petId;
    }

    const [data, total] = await Promise.all([
      this.prisma.vaccination.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: {
          appliedAt: 'desc',
        },
        include: {
          pet: true,
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
      }),
      this.prisma.vaccination.count({ where }),
    ]);

    const totalPages = limitNumber > 0 ? Math.ceil(total / limitNumber) : (total > 0 ? 1 : 0);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1 && totalPages > 0;

    return {
      data,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  /**
   * Consulta el detalle de una vacunación específica por su identificador.
   */
  async findById(id: string, clinicId?: string): Promise<VaccinationWithRelations> {
    const where: Prisma.VaccinationWhereInput = {
      id,
      deletedAt: null,
    };

    if (clinicId) {
      where.clinicId = clinicId;
    }

    const vaccination = await this.prisma.vaccination.findFirst({
      where,
      include: {
        pet: true,
        veterinarian: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            licenseNumber: true,
          },
        },
        clinic: true,
      },
    });

    if (!vaccination) {
      throw new NotFoundException('Vacunación no encontrada o inactiva');
    }

    return vaccination;
  }
}
