import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccessAction,
  GrantScope,
  GrantSource,
  Prisma,
  Tag,
  TagStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessLogsService } from '../audit/access-logs.service';
import { AccessGrantsService } from '../pets/access-grants.service';
import { AssignTagDto } from './dto/assign-tag.dto';
import { ReportTagStatusDto } from './dto/report-tag-status.dto';

/**
 * Servicio de gestión y resolución transaccional de tags NFC (RF-28 a RF-32, RF-56).
 */
@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessLogsService: AccessLogsService,
    private readonly accessGrantsService: AccessGrantsService,
  ) {}

  /**
   * Resuelve la identidad de una mascota asociada a un tag NFC físico activo (RF-28, RF-29, RF-56).
   * Si el tag existe y está activo con una mascota válida:
   *   - Ejecuta una transacción atómica ($transaction) registrando la traza en AccessLog (NFC_SCAN).
   *   - Otorga/extiende un AccessGrant por 24 horas a favor de clinicId con alcance FULL_HISTORY.
   *   - Retorna la ficha médica de la mascota con hasFullAccess = true y el consentimiento otorgado.
   * Si el tag no está registrado, no tiene mascota o la mascota fue eliminada lógicamente:
   *   - Lanza NotFoundException con el payload estructurado { registered: false, uid } (RF-29).
   */
  async resolveUid(
    uid: string,
    clinicId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const tag = await this.prisma.tag.findFirst({
      where: {
        uid,
        status: TagStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        pet: {
          include: {
            owner: true,
          },
        },
      },
    });

    if (!tag || !tag.petId || !tag.pet || tag.pet.deletedAt !== null) {
      throw new NotFoundException({
        registered: false,
        uid,
      });
    }

    // Un ClinicOwner con status REVOKED bloquea el escaneo (403 sin emitir grant) y registra el intento en AccessLog
    if (tag.pet.ownerId) {
      const existingLink = await this.prisma.clinicOwner.findUnique({
        where: {
          clinicId_ownerId: { clinicId, ownerId: tag.pet.ownerId },
        },
      });

      if (existingLink?.status === 'REVOKED') {
        await this.accessLogsService.log({
          petId: tag.petId,
          clinicId,
          userId,
          action: AccessAction.NFC_SCAN_DENIED,
          ipAddress,
          userAgent,
        });
        throw new ForbiddenException('El acceso para esta clínica ha sido revocado por el dueño o administración');
      }
    }

    const grant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.accessLogsService.log(
        {
          petId: tag.petId!,
          clinicId,
          userId,
          action: AccessAction.NFC_SCAN,
          ipAddress,
          userAgent,
        },
        tx,
      );

      // Vincular o renovar al dueño con la clínica en ClinicOwner (Punto Uno y Punto Dos)
      if (tag.pet?.ownerId) {
        const existingLink = await tx.clinicOwner.findUnique({
          where: { clinicId_ownerId: { clinicId, ownerId: tag.pet.ownerId } },
        });

        const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (!existingLink) {
          // Usa upsert para evitar la carrera con @@unique([clinicId, ownerId])
          await tx.clinicOwner.upsert({
            where: {
              clinicId_ownerId: { clinicId, ownerId: tag.pet.ownerId },
            },
            create: {
              clinicId,
              ownerId: tag.pet.ownerId,
              consentedAt: new Date(),
              expiresAt: thirtyDays,
              status: 'ACTIVE',
            },
            update: {},
          });
        } else if (existingLink.status === 'ACTIVE') {
          // Un vínculo ACTIVE con expiresAt nulo no se modifica.
          // Un vínculo vencido se renueva por 30 días.
          if (existingLink.expiresAt !== null && new Date(existingLink.expiresAt) <= new Date()) {
            await tx.clinicOwner.update({
              where: { id: existingLink.id },
              data: {
                consentedAt: new Date(),
                expiresAt: thirtyDays,
              },
            });
          }
        }
      }

      return this.accessGrantsService.grantAccess(
        tag.petId!,
        clinicId,
        GrantSource.NFC_TAP,
        GrantScope.FULL_HISTORY,
        24,
        tx,
      );
    });

    const sanitizedOwner = tag.pet.owner
      ? {
          name: tag.pet.owner.name,
          lastName: tag.pet.owner.lastName,
          phone: tag.pet.owner.phone,
        }
      : null;

    const sanitizedPet = {
      ...tag.pet,
      owner: sanitizedOwner,
    };

    const isOriginClinic = tag.pet.createdByClinicId === clinicId;

    const clinicPatient = await this.prisma.clinicPatient?.findUnique
      ? await this.prisma.clinicPatient.findUnique({
          where: { clinicId_petId: { clinicId, petId: tag.petId! } },
        })
      : null;

    return {
      registered: true as const,
      uid,
      pet: sanitizedPet,
      hasFullAccess: true,
      grant,
      isInRoster: !!clinicPatient,
      ...(isOriginClinic ? { tag, publicCode: tag.publicCode } : {}),
    };
  }

  /**
   * Asocia un UID físico libre a una mascota registrada en el sistema (RF-30, RF-31).
   * Valida existencia de la mascota y previene colisiones con tags activos en el sistema o para la mascota.
   */
  async assignTag(assignDto: AssignTagDto, clinicId?: string): Promise<Tag> {
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: assignDto.petId,
        deletedAt: null,
      },
      include: {
        visits: { where: { deletedAt: null } },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota con ID ' + assignDto.petId + ' no encontrada o inactiva');
    }

    if (clinicId) {
      const isOrigin = pet.createdByClinicId === clinicId;
      const hasVisitsInClinic = pet.visits?.some((v: any) => v.clinicId === clinicId);
      const hasGrant = this.accessGrantsService
        ? await this.accessGrantsService.hasActiveGrant(assignDto.petId, clinicId)
        : false;

      if (!isOrigin && !hasVisitsInClinic && !hasGrant) {
        throw new NotFoundException('Mascota con ID ' + assignDto.petId + ' no encontrada o inactiva');
      }
    }

    const existingTagWithUid = await this.prisma.tag.findFirst({
      where: {
        uid: assignDto.uid,
        status: TagStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (existingTagWithUid) {
      throw new ConflictException('El UID físico ya se encuentra activo en el sistema');
    }

    const existingTagForPet = await this.prisma.tag.findFirst({
      where: {
        petId: assignDto.petId,
        status: TagStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (existingTagForPet) {
      throw new ConflictException('La mascota ya cuenta con un tag activo asignado');
    }

    return this.prisma.tag.create({
      data: {
        uid: assignDto.uid,
        petId: assignDto.petId,
        status: TagStatus.ACTIVE,
        publicCode: randomUUID(),
      },
    });
  }

  /**
   * Conmuta el estado operativo del tag (LOST, DAMAGED, INACTIVE) conservando el historial (RF-32, RF-63).
   * Restringido a tags pertenecientes a la clínica en sesión.
   */
  async reportStatus(tagId: string, statusDto: ReportTagStatusDto, clinicId: string): Promise<Tag> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const tag = await this.prisma.tag.findFirst({
      where: {
        id: tagId,
        deletedAt: null,
      },
      include: {
        pet: {
          include: {
            visits: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag con ID '${tagId}' no encontrado o inactivo`);
    }

    if (tag.pet) {
      const isOrigin = tag.pet.createdByClinicId === clinicId;
      const hasVisitsInClinic = tag.pet.visits?.some((v: any) => v.clinicId === clinicId);
      if (!isOrigin && !hasVisitsInClinic) {
        throw new NotFoundException(`Tag con ID '${tagId}' no encontrado o no pertenece a la clínica`);
      }
    }

    return this.prisma.tag.update({
      where: { id: tagId },
      data: {
        status: statusDto.status,
      },
    });
  }

  /**
   * Consulta el historial cronológico de tags vinculados a una mascota ordenados por fecha de creación desc (RF-61).
   * Exige vínculo asistencial en la clínica autenticada o AccessGrant activo.
   */
  async findByPetId(petId: string, clinicId: string): Promise<Tag[]> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, deletedAt: null },
      include: {
        visits: { where: { deletedAt: null } },
      },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    const isOrigin = pet.createdByClinicId === clinicId;

    if (!isOrigin) {
      throw new NotFoundException('Tags de mascota no encontrados o no autorizados');
    }

    return this.prisma.tag.findMany({
      where: {
        petId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
