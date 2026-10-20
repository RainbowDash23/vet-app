import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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
   * Registra un nuevo dueño en el padrón centralizado (RF-14, RF-15, RF-60).
   * Verifica que no exista un dueño activo con el mismo documento de identidad (RF-15).
   * Registra createdByClinicId y crea el vínculo en ClinicOwner dentro de una transacción.
   */
  async create(createOwnerDto: CreateOwnerDto, clinicId: string, userId?: string): Promise<Owner> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const existingOwner = await this.prisma.owner.findFirst({
      where: {
        documentId: createOwnerDto.documentId,
        deletedAt: null,
      },
    });

    if (existingOwner) {
      throw new ConflictException('Documento de identidad ya registrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({
        data: {
          documentId: createOwnerDto.documentId,
          name: createOwnerDto.name,
          lastName: createOwnerDto.lastName,
          phone: createOwnerDto.phone,
          email: createOwnerDto.email ?? null,
          address: createOwnerDto.address ?? null,
          createdByClinicId: clinicId,
          createdById: userId ?? null,
        },
      });

      if ((tx as any).clinicOwner) {
        await (tx as any).clinicOwner.create({
          data: {
            clinicId,
            ownerId: owner.id,
            consentedAt: new Date(),
            status: 'ACTIVE',
          },
        });
      }

      return owner;
    });
  }

  /**
   * Consulta ciega de existencia de un dueño por documentId (RF-60).
   * Retorna { exists: true, pendingConsent: true } si existe, o { exists: false } si no.
   * Cero exposición de datos personales.
   */
  async lookup(documentId: string): Promise<{ exists: boolean; pendingConsent?: boolean }> {
    const owner = await this.prisma.owner.findFirst({
      where: {
        documentId: documentId.trim(),
        deletedAt: null,
      },
    });

    if (!owner) {
      return { exists: false };
    }

    return { exists: true, pendingConsent: true };
  }

  /**
   * Determina si la clínica solicitante posee una relación asistencial plena con el dueño (RF-60).
   * Criterios estrictos (Punto Uno):
   * 1. Clínica creadora del dueño (owner.createdByClinicId === clinicId).
   * 2. Existencia de al menos una visita médica cerrada por un veterinario (closedAt !== null)
   *    en alguna mascota del dueño. Visitas PENDING, SCHEDULED o CANCELLED NO computan.
   * 3. Existencia de al menos una vacunación aplicada en alguna mascota del dueño.
   */
  async hasCareRelationship(clinicId: string, owner: any): Promise<boolean> {
    if (!owner) return false;
    if (owner.createdByClinicId === clinicId) {
      return true;
    }

    const pets = await this.prisma.pet.findMany({
      where: { ownerId: owner.id, deletedAt: null },
      select: { id: true },
    });
    if (!pets || pets.length === 0) {
      return false;
    }
    const petIds = pets.map((p) => p.id);

    const [closedVisit, vaccination] = await Promise.all([
      this.prisma.visit.findFirst({
        where: {
          clinicId,
          closedAt: { not: null },
          deletedAt: null,
          petId: { in: petIds },
        },
        select: { id: true },
      }),
      this.prisma.vaccination.findFirst({
        where: {
          clinicId,
          deletedAt: null,
          petId: { in: petIds },
        },
        select: { id: true },
      }),
    ]);

    return Boolean(closedVisit || vaccination);
  }

  /**
   * Aplica proyección de datos del dueño según el grado de vinculación asistencial (RF-60).
   * Con vínculo pleno: retorna la entidad completa.
   * Con vínculo mínimo (solo escaneo NFC / sin visita cerrada ni vacuna):
   * Proyecta únicamente { id, name, lastName, phone, createdAt, updatedAt }, censurando documentId, email y address.
   */
  filterOwnerProjection(owner: any, isFullAccess: boolean): any {
    if (!owner) return owner;
    if (isFullAccess) return owner;

    return {
      id: owner.id,
      name: owner.name,
      lastName: owner.lastName,
      phone: owner.phone,
      createdAt: owner.createdAt,
      updatedAt: owner.updatedAt,
    };
  }

  /**
   * Búsqueda paginada estándar de dueños activos (RF-16, RF-60).
   * Restringe los resultados a aquellos con vínculo asistencial en la clínica autenticada (RF-60).
   * Los filtros por documentId, email y address solo operan sobre dueños con proyección completa (RF-60).
   */
  async findAll(queryDto: SearchOwnerQueryDto, clinicId: string): Promise<PaginatedResult<any>> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const page = queryDto.page && queryDto.page >= 1 ? queryDto.page : 1;
    const limit = queryDto.limit && queryDto.limit >= 1 ? Math.min(100, queryDto.limit) : 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const [clinicOwners, originOwners, originPets, clinicClosedVisits, clinicVaccinations] = await Promise.all([
      (this.prisma as any).clinicOwner?.findMany
        ? (this.prisma as any).clinicOwner.findMany({
            where: { clinicId, status: 'ACTIVE' },
            select: { ownerId: true, expiresAt: true },
          })
        : Promise.resolve([]),
      this.prisma.owner.findMany({
        where: { createdByClinicId: clinicId, deletedAt: null },
        select: { id: true },
      }),
      (this.prisma as any).pet?.findMany
        ? (this.prisma as any).pet.findMany({
            where: { createdByClinicId: clinicId, deletedAt: null },
            select: { ownerId: true },
          })
        : Promise.resolve([]),
      (this.prisma as any).visit?.findMany
        ? (this.prisma as any).visit.findMany({
            where: { clinicId, closedAt: { not: null }, deletedAt: null },
            select: { petId: true },
          })
        : Promise.resolve([]),
      (this.prisma as any).vaccination?.findMany
        ? (this.prisma as any).vaccination.findMany({
            where: { clinicId, deletedAt: null },
            select: { petId: true },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const validScanOwnerIds = (clinicOwners || [])
      .filter((co: any) => !co.expiresAt || new Date(co.expiresAt) > now)
      .map((co: any) => co.ownerId);

    const relevantPetIds = Array.from(
      new Set([
        ...(clinicClosedVisits || []).map((v: any) => v.petId),
        ...(clinicVaccinations || []).map((vac: any) => vac.petId),
      ]),
    );

    let carePetOwnerIds: string[] = [];
    if (relevantPetIds.length > 0 && (this.prisma as any).pet?.findMany) {
      const pets = await (this.prisma as any).pet.findMany({
        where: { id: { in: relevantPetIds }, deletedAt: null },
        select: { ownerId: true },
      });
      carePetOwnerIds = (pets || []).map((p: any) => p.ownerId);
    }

    const fullAccessOwnerIds = Array.from(
      new Set([
        ...originOwners.map((o: any) => o.id),
        ...originPets.map((p: any) => p.ownerId),
        ...carePetOwnerIds,
      ]),
    );

    const allLinkedOwnerIds = Array.from(
      new Set([...fullAccessOwnerIds, ...validScanOwnerIds]),
    );

    if (allLinkedOwnerIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
      };
    }

    const minimalAccessOwnerIds = allLinkedOwnerIds.filter((id) => !fullAccessOwnerIds.includes(id));

    // Si se filtra por datos confidenciales (documentId, email, address), solo operan sobre fullAccessOwnerIds (Punto Cinco)
    const requiresFullAccess = Boolean(queryDto.documentId || queryDto.email || queryDto.address);
    const candidateIds = requiresFullAccess ? fullAccessOwnerIds : allLinkedOwnerIds;

    const where: Prisma.OwnerWhereInput = {
      deletedAt: null,
      id: { in: candidateIds },
    };

    if (queryDto.documentId) {
      where.documentId = {
        contains: queryDto.documentId,
        mode: 'insensitive',
      };
    }

    if (queryDto.email) {
      where.email = {
        contains: queryDto.email,
        mode: 'insensitive',
      };
    }

    if (queryDto.address) {
      where.address = {
        contains: queryDto.address,
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

    if (queryDto.name) {
      where.name = {
        contains: queryDto.name,
        mode: 'insensitive',
      };
    }

    if (queryDto.query && queryDto.query.trim() !== '') {
      const q = queryDto.query.trim();
      const qClauses: Prisma.OwnerWhereInput[] = [
        { name: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];

      if (fullAccessOwnerIds.length > 0) {
        qClauses.push(
          { id: { in: fullAccessOwnerIds }, documentId: { contains: q, mode: 'insensitive' } },
          { id: { in: fullAccessOwnerIds }, email: { contains: q, mode: 'insensitive' } },
          { id: { in: fullAccessOwnerIds }, address: { contains: q, mode: 'insensitive' } },
        );
      }

      where.OR = qClauses;
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

    const projectedData = data.map((o: any) =>
      this.filterOwnerProjection(o, fullAccessOwnerIds.includes(o.id)),
    );

    const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1 && totalPages > 0;

    return {
      data: projectedData,
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
   * Consulta los datos de un dueño por su identificador único (RF-14, RF-60).
   * Lanza NotFoundException si no existe o no tiene vínculo con la clínica autenticada (RF-60).
   * Proyecta datos mínimos si solo posee vínculo por escaneo sin care relationship (RF-60).
   */
  async findById(id: string, clinicId: string): Promise<any> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const owner = await this.prisma.owner.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!owner) {
      throw new NotFoundException('Dueño no encontrado');
    }

    const hasCare = await this.hasCareRelationship(clinicId, owner);
    if (hasCare) {
      return this.filterOwnerProjection(owner, true);
    }

    const clinicOwner = (this.prisma as any).clinicOwner
      ? await (this.prisma as any).clinicOwner.findFirst({
          where: { clinicId, ownerId: id, status: 'ACTIVE' },
        })
      : null;

    if (!clinicOwner) {
      throw new NotFoundException('Dueño no encontrado');
    }

    if (clinicOwner.expiresAt && new Date(clinicOwner.expiresAt) <= new Date()) {
      throw new NotFoundException('Dueño no encontrado');
    }

    return this.filterOwnerProjection(owner, false);
  }

  /**
   * Actualiza los datos de filiación o contacto de un dueño activo (RF-14, RF-63).
   * Lanza NotFoundException si no existe o pertenece a otra clínica.
   */
  async update(id: string, updateOwnerDto: UpdateOwnerDto, clinicId: string): Promise<Owner> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    await this.findById(id, clinicId);

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
  async softDelete(id: string, clinicId: string): Promise<Owner> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    await this.findById(id, clinicId);

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
