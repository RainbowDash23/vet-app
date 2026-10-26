import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccessAction,
  ClinicPatientSource,
  GrantScope,
  Pet,
  PetSex,
  Prisma,
  ReproductiveStatus,
  TagStatus,
} from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessGrantsService } from './access-grants.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { SearchPetQueryDto } from './dto/search-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { filterPetDataByConsent } from './utils/pet-consent.filter';

/**
 * Servicio para la gestión de mascotas en el padrón centralizado (RF-17 a RF-20, RF-59, RF-60, RF-63).
 */
@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly accessGrantsService?: AccessGrantsService,
  ) {}

  /**
   * Registra una nueva mascota vinculada a un dueño (RF-17, RF-60).
   * Verifica la existencia y estado activo del dueño asociado (RF-18).
   * Exige vínculo asistencial de la clínica con el dueño (creador o ClinicOwner) y registra provenance.
   * Atómicamente incluye a la mascota en el padrón de la clínica registrante (ClinicPatient con source REGISTERED).
   */
  async create(createPetDto: CreatePetDto, clinicId: string, userId?: string): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const owner = await this.prisma.owner.findFirst({
      where: {
        id: createPetDto.ownerId,
        deletedAt: null,
      },
    });

    if (!owner) {
      throw new NotFoundException('Dueño no encontrado o inactivo');
    }

    const isOrigin = owner.createdByClinicId === clinicId;
    let hasClinicOwner = false;
    const co = await this.prisma.clinicOwner.findFirst({
      where: { clinicId, ownerId: createPetDto.ownerId, status: 'ACTIVE' },
    });
    if (co) hasClinicOwner = true;

    if (!isOrigin && !hasClinicOwner) {
      throw new NotFoundException('Dueño no encontrado o no vinculado a esta clínica');
    }

    return this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.create({
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
          createdByClinicId: clinicId,
          createdById: userId ?? null,
        },
      });

      await tx.clinicPatient.create({
        data: {
          clinicId,
          petId: pet.id,
          source: ClinicPatientSource.REGISTERED,
          addedAt: new Date(),
        },
      });

      return pet;
    });
  }

  /**
   * Búsqueda y listado paginado estándar de mascotas activas del padrón de la clínica (RF-63).
   * Filtrado estricto por clinicPatients de la clínica autenticada.
   * Permite filtrar por ownerId, species o término de búsqueda (query en nombre, raza, dueño o documento).
   */
  async findAll(queryDto: SearchPetQueryDto, clinicId?: string): Promise<PaginatedResult<Pet>> {
    const page = queryDto.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.PetWhereInput = {
      deletedAt: null,
    };

    if (clinicId) {
      where.clinicPatients = {
        some: { clinicId },
      };
    }

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
        { owner: { name: { contains: q, mode: 'insensitive' } } },
        { owner: { lastName: { contains: q, mode: 'insensitive' } } },
        { owner: { documentId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.pet.count({ where }),
      this.prisma.pet.findMany({
        where,
        skip,
        take,
        include: {
          owner: true,
          tags: {
            where: { deletedAt: null, status: TagStatus.ACTIVE },
          },
          clinicPatients: clinicId ? { where: { clinicId } } : undefined,
        },
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
   * Consulta el detalle de una mascota activa por su identificador (RF-17, RF-59).
   * Aplica proyección sanitizada filterPetDataByConsent si no media AccessGrant ni titularidad (RF-59).
   */
  async findById(id: string, clinicId: string): Promise<any> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

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
        visits: {
          where: { deletedAt: null },
        },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    let hasFullAccess = false;
    const isOriginClinic = pet.createdByClinicId === clinicId;
    const hasVisitsInClinic = pet.visits?.some((v: any) => v.clinicId === clinicId);
    let activeGrant: any = null;
    if (isOriginClinic || hasVisitsInClinic) {
      hasFullAccess = true;
    } else if (this.accessGrantsService) {
      activeGrant = await this.accessGrantsService.getActiveGrant(id, clinicId);
      hasFullAccess = !!activeGrant;
    }

    const clinicPatient = await this.prisma.clinicPatient?.findUnique
      ? await this.prisma.clinicPatient.findUnique({
          where: { clinicId_petId: { clinicId, petId: id } },
        })
      : null;

    const filtered = filterPetDataByConsent(pet, hasFullAccess);
    filtered.isInRoster = !!clinicPatient;
    if (activeGrant) {
      filtered.activeGrant = {
        id: activeGrant.id,
        expiresAt: activeGrant.expiresAt,
        scope: activeGrant.scope,
      };
    }

    return filtered;
  }

  /**
   * Agrega un paciente al listado de la clínica activa (roster) tras escaneo NFC (RF-63).
   * Requiere un AccessGrant vigente o ser la clínica de origen.
   * Es idempotente: si ya está en el padrón de la clínica, no duplica.
   * Registra traza inmutable en AccessLog con la acción ROSTER_ADD.
   */
  async addToRoster(petId: string, clinicId: string, userId?: string): Promise<any> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, deletedAt: null },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada o sin autorización de acceso');
    }

    const isOriginClinic = pet.createdByClinicId === clinicId;
    let hasGrant = false;
    if (this.accessGrantsService) {
      hasGrant = await this.accessGrantsService.hasActiveGrant(petId, clinicId);
    }

    if (!isOriginClinic && !hasGrant) {
      // No revelar si la mascota existe cuando no hay grant vigente (fail-closed)
      throw new NotFoundException('Mascota no encontrada o sin autorización de acceso');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clinicPatient.findUnique({
        where: {
          clinicId_petId: { clinicId, petId },
        },
      });

      let rosterEntry = existing;
      if (!rosterEntry) {
        rosterEntry = await tx.clinicPatient.create({
          data: {
            clinicId,
            petId,
            source: isOriginClinic ? ClinicPatientSource.REGISTERED : ClinicPatientSource.ADDED_AFTER_SCAN,
            addedAt: new Date(),
          },
        });
      }

      await tx.accessLog.create({
        data: {
          petId,
          clinicId,
          userId: userId ?? null,
          action: AccessAction.ROSTER_ADD,
        },
      });

      return {
        success: true,
        roster: rosterEntry,
        message: 'Paciente agregado a la lista de su clínica exitosamente',
      };
    });
  }

  /**
   * Actualiza los atributos de una mascota activa (RF-63).
   * Restringido a la clínica titular o con vínculo asistencial.
   */
  async update(id: string, updatePetDto: UpdatePetDto, clinicId: string): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const pet = await this.prisma.pet.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        visits: {
          where: { deletedAt: null },
        },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    const isOriginClinic = pet.createdByClinicId === clinicId;
    const hasVisitsInClinic = pet.visits?.some((v: any) => v.clinicId === clinicId);
    if (!isOriginClinic && !hasVisitsInClinic) {
      throw new NotFoundException('Mascota no encontrada');
    }

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
  async softDelete(id: string, clinicId: string): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const pet = await this.prisma.pet.findFirst({
      where: { id, deletedAt: null },
      include: { visits: { where: { deletedAt: null } } },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    const isOriginClinic = pet.createdByClinicId === clinicId;
    const hasVisitsInClinic = pet.visits?.some((v: any) => v.clinicId === clinicId);
    if (!isOriginClinic && !hasVisitsInClinic) {
      throw new NotFoundException('Mascota no encontrada');
    }

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
