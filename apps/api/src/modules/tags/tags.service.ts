import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessAction,
  GrantScope,
  GrantSource,
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

    const grant = await this.prisma.$transaction(async () => {
      await this.accessLogsService.log({
        petId: tag.petId!,
        clinicId,
        userId,
        action: AccessAction.NFC_SCAN,
        ipAddress,
        userAgent,
      });

      return this.accessGrantsService.grantAccess(
        tag.petId!,
        clinicId,
        GrantSource.NFC_TAP,
        GrantScope.FULL_HISTORY,
        24,
      );
    });

    return {
      registered: true as const,
      uid,
      pet: tag.pet,
      hasFullAccess: true,
      grant,
    };
  }

  /**
   * Asocia un UID físico libre a una mascota registrada en el sistema (RF-30, RF-31).
   * Valida existencia de la mascota y previene colisiones con tags activos en el sistema o para la mascota.
   */
  async assignTag(assignDto: AssignTagDto): Promise<Tag> {
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: assignDto.petId,
        deletedAt: null,
      },
    });

    if (!pet) {
      throw new NotFoundException(`Mascota con ID '${assignDto.petId}' no encontrada o inactiva`);
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
   * Conmuta el estado operativo del tag (LOST, DAMAGED, INACTIVE) conservando el historial (RF-32).
   */
  async reportStatus(tagId: string, statusDto: ReportTagStatusDto): Promise<Tag> {
    const tag = await this.prisma.tag.findFirst({
      where: {
        id: tagId,
        deletedAt: null,
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag con ID '${tagId}' no encontrado o inactivo`);
    }

    return this.prisma.tag.update({
      where: { id: tagId },
      data: {
        status: statusDto.status,
      },
    });
  }

  /**
   * Consulta el historial cronológico de tags vinculados a una mascota ordenados por fecha de creación desc.
   */
  async findByPetId(petId: string): Promise<Tag[]> {
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
