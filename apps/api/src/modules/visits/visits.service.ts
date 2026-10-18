import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { GrantScope, Prisma, Visit, VisitStatus } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessGrantsService } from '../pets/access-grants.service';
import { CollisionValidator } from './collision.validator';
import { VitalsValidator } from './vitals.validator';
import { AttendVisitDto } from './dto/attend-visit.dto';
import { CancelVisitDto } from './dto/cancel-visit.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { QueryVisitDto } from './dto/query-visit.dto';

/**
 * Servicio de gestión de visitas clínicas y agenda profesional (RF-39, RF-40, RF-43, RF-44, RF-45, RF-47).
 */
@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collisionValidator: CollisionValidator,
    private readonly vitalsValidator: VitalsValidator = new VitalsValidator(),
    @Optional() private readonly accessGrantsService?: AccessGrantsService,
  ) {}

  /**
   * Agenda una nueva visita clínica previniendo matemáticamente solapamientos (RF-39, RF-40).
   */
  async scheduleVisit(clinicId: string, createVisitDto: CreateVisitDto): Promise<Visit> {
    // 1. Verificar existencia y vigencia de la mascota
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: createVisitDto.petId,
        deletedAt: null,
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada o inactiva');
    }

    // 2. Verificar existencia y vigencia del veterinario
    const vet = await this.prisma.user.findFirst({
      where: {
        id: createVisitDto.vetId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!vet) {
      throw new NotFoundException('Veterinario no encontrado o inactivo');
    }

    // 3. Consultar visitas existentes del mismo veterinario en estados activos
    const existingVisits = await this.prisma.visit.findMany({
      where: {
        vetId: createVisitDto.vetId,
        deletedAt: null,
        status: {
          in: [VisitStatus.SCHEDULED, VisitStatus.PENDING],
        },
      },
      select: {
        id: true,
        scheduledDate: true,
        durationMinutes: true,
      },
    });

    // 4. Evaluar colisión algorítmica de intervalos temporales
    const scheduledDate = new Date(createVisitDto.scheduledDate);
    const durationMinutes = createVisitDto.durationMinutes ?? 30;

    const hasOverlap = this.collisionValidator.hasCollision(
      scheduledDate,
      durationMinutes,
      existingVisits,
    );

    if (hasOverlap) {
      throw new ConflictException(
        'El veterinario presenta un solapamiento de horario con otra cita programada',
      );
    }

    // 5. Persistir la visita en la base de datos
    const status = createVisitDto.status ?? VisitStatus.SCHEDULED;

    return this.prisma.visit.create({
      data: {
        clinicId,
        vetId: createVisitDto.vetId,
        petId: createVisitDto.petId,
        scheduledDate,
        durationMinutes,
        reason: createVisitDto.reason.trim(),
        status,
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
   * Consulta paginada de visitas pertenecientes a una clínica con filtros opcionales.
   */
  async findAll(clinicId: string, queryDto?: QueryVisitDto): Promise<PaginatedResult<Visit>> {
    const page = queryDto?.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto?.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.VisitWhereInput = {
      clinicId,
      deletedAt: null,
    };

    if (queryDto?.petId) {
      where.petId = queryDto.petId;
    }

    if (queryDto?.vetId) {
      where.vetId = queryDto.vetId;
    }

    if (queryDto?.status) {
      where.status = queryDto.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        skip,
        take,
        orderBy: {
          scheduledDate: 'asc',
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
      this.prisma.visit.count({ where }),
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
   * Consulta el detalle de una visita por su identificador único.
   */
  async findById(id: string): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id,
        deletedAt: null,
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

    if (!visit) {
      throw new NotFoundException('Visita no encontrada o inactiva');
    }

    return visit;
  }

  /**
   * Cancela una visita médica registrando obligatoriamente el motivo y liberando la agenda (RF-41, RF-42).
   */
  async cancelVisit(
    clinicId: string,
    visitId: string,
    cancelDto: CancelVisitDto,
  ): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!visit) {
      throw new NotFoundException('Visita no encontrada');
    }

    if (visit.closedAt !== null) {
      throw new ConflictException(
        'No se puede cancelar una visita médica que ya ha sido cerrada',
      );
    }

    if (visit.status === VisitStatus.CANCELLED) {
      throw new ConflictException('La visita ya se encuentra cancelada');
    }

    return this.prisma.visit.update({
      where: { id: visitId },
      data: {
        status: VisitStatus.CANCELLED,
        cancellationReason: cancelDto.cancellationReason.trim(),
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
   * Registra la atención médica y constantes fisiológicas de una visita clínica (RF-43, RF-44).
   * Bloquea la modificación si la visita ya fue formalmente cerrada (RF-45).
   */
  async attendVisit(
    clinicId: string,
    visitId: string,
    vetId: string,
    attendDto: AttendVisitDto,
  ): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!visit) {
      throw new NotFoundException('Visita no encontrada');
    }

    if (visit.closedAt !== null) {
      throw new ForbiddenException(
        'No se puede modificar una visita médica que ya ha sido cerrada formalmente',
      );
    }

    if (visit.status === VisitStatus.CANCELLED) {
      throw new ConflictException('No se puede atender una visita cancelada');
    }

    // Validar constantes biológicas y fisiológicas (RF-44)
    this.vitalsValidator.validateVitals({
      weight: attendDto.weight,
      temperature: attendDto.temperature,
      heartRate: attendDto.heartRate,
      respiratoryRate: attendDto.respiratoryRate,
      capillaryRefillTime: attendDto.capillaryRefillTime,
    });

    const updateData: Prisma.VisitUpdateInput = {};

    if (attendDto.notes !== undefined) {
      updateData.notes = attendDto.notes;
    }
    if (attendDto.diagnosis !== undefined) {
      updateData.diagnosis = attendDto.diagnosis;
    }
    if (attendDto.treatment !== undefined) {
      updateData.treatment = attendDto.treatment;
    }
    if (attendDto.weight !== undefined) {
      updateData.weight = attendDto.weight;
    }
    if (attendDto.temperature !== undefined) {
      updateData.temperature = attendDto.temperature;
    }
    if (attendDto.heartRate !== undefined) {
      updateData.heartRate = attendDto.heartRate;
    }
    if (attendDto.respiratoryRate !== undefined) {
      updateData.respiratoryRate = attendDto.respiratoryRate;
    }
    if (attendDto.capillaryRefillTime !== undefined) {
      updateData.capillaryRefillTime = attendDto.capillaryRefillTime;
    }

    return this.prisma.visit.update({
      where: { id: visitId },
      data: updateData,
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
   * Cierra formalmente una visita clínica marcando closedAt con la fecha y hora actual (RF-45).
   * Impide el cierre reiterado o el cierre de visitas canceladas.
   */
  async closeVisit(
    clinicId: string,
    visitId: string,
    vetId: string,
  ): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!visit) {
      throw new NotFoundException('Visita no encontrada');
    }

    if (visit.closedAt !== null) {
      throw new ConflictException('La visita médica ya se encuentra cerrada');
    }

    if (visit.status === VisitStatus.CANCELLED) {
      throw new ConflictException('No se puede cerrar una visita cancelada');
    }

    return this.prisma.visit.update({
      where: { id: visitId },
      data: {
        closedAt: new Date(),
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
   * Consulta el historial médico completo de una mascota ordenado cronológicamente de forma descendente (RF-47, RF-57).
   * Exige la existencia de un consentimiento (AccessGrant) activo con alcance FULL_HISTORY a favor de la clínica solicitante (RF-47, RNF-8).
   *
   * @param petId Identificador único de la mascota
   * @param clinicId Identificador de la clínica que realiza la consulta
   * @param page Número de página (base 1)
   * @param limit Cantidad de registros por página
   */
  async getPetMedicalHistory(
    petId: string,
    clinicId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<Visit>> {
    // 1. Verificar vigencia del consentimiento AccessGrant a favor de clinicId (RF-47, RNF-8)
    if (this.accessGrantsService) {
      const hasGrant = await this.accessGrantsService.hasActiveGrant(
        petId,
        clinicId,
        GrantScope.FULL_HISTORY,
      );
      if (!hasGrant) {
        throw new ForbiddenException(
          'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
        );
      }
    } else {
      throw new ForbiddenException(
        'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
      );
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.VisitWhereInput = {
      petId,
      deletedAt: null,
    };

    // 2. Consulta las visitas de petId con deletedAt === null ordenadas por scheduledDate desc (RF-47).
    // Incluye notas complementarias (notesHistory con veterinario), veterinario, diagnóstico, tratamiento, constantes vitales y estado.
    const [total, visits] = await Promise.all([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: {
          scheduledDate: 'desc',
        },
        include: {
          notesHistory: {
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
          },
          veterinarian: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              licenseNumber: true,
            },
          },
          pet: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limitNumber);

    return {
      data: visits,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    };
  }
}
