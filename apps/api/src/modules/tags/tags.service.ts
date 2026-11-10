import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccessAction,
  GrantScope,
  GrantSource,
  NotificationStatus,
  NotificationType,
  Prisma,
  Tag,
  TagStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessLogsService } from '../audit/access-logs.service';
import { AccessGrantsService } from '../pets/access-grants.service';
import { MailTransportService } from '../notifications/mail-transport.service';
import { TagAbuseProtectionService } from './tag-abuse-protection.service';
import { AssignTagDto } from './dto/assign-tag.dto';
import { ReportTagStatusDto } from './dto/report-tag-status.dto';

/**
 * Servicio de gestión y resolución transaccional de tags NFC (RF-28 a RF-32, RF-56).
 */
@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessLogsService: AccessLogsService,
    private readonly accessGrantsService: AccessGrantsService,
    @Optional()
    private readonly abuseProtectionService?: TagAbuseProtectionService,
    @Optional()
    private readonly mailTransportService?: MailTransportService,
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

    // 1. Control de abuso: Rate limit específico por usuario y por clínica
    if (this.abuseProtectionService) {
      await this.abuseProtectionService.checkRateLimit(
        clinicId,
        userId,
        ipAddress,
        userAgent,
        tag?.petId ?? null,
      );
    }

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

    // 2. Control de abuso: Detección pasiva de anomalías (más de N mascotas distintas en una ventana corta)
    if (this.abuseProtectionService) {
      await this.abuseProtectionService.recordAndCheckAnomaly(
        clinicId,
        tag.petId!,
        userId,
        ipAddress,
        userAgent,
      );
    }

    // 3. Control de abuso: Aviso al dueño en escaneo cross-clínica (idempotente y no bloqueante)
    if (!isOriginClinic && tag.pet.createdByClinicId && tag.pet.owner?.email) {
      this.sendOwnerNfcAlertAsync(tag.pet, clinicId).catch((err: Error) => {
        this.logger.warn(`[Aviso al Dueño NFC] Fallo no bloqueante en notificación: ${err?.message}`);
      });
    }

    const clinicPatient = await this.prisma.clinicPatient.findUnique({
      where: { clinicId_petId: { clinicId, petId: tag.petId! } },
    });

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

  /**
   * Emite una notificación al dueño cuando una clínica distinta a la de origen escanea el tag NFC.
   * - Idempotente: máximo un aviso por clínica y día para la misma mascota.
   * - Contenido mínimo: nombre de mascota, clínica que escaneó, fecha.
   *   CERO datos clínicos, CERO documentos del dueño, CERO dirección física.
   * - No bloqueante: cualquier error se captura y registra sin interrumpir la atención médica.
   * - Si el dueño no tiene email, no se envía nada.
   */
  private async sendOwnerNfcAlertAsync(
    pet: { id: string; name: string; createdByClinicId?: string | null; owner?: { email?: string | null } | null },
    scanningClinicId: string,
  ): Promise<void> {
    try {
      const ownerEmail = pet.owner?.email?.trim();
      if (!ownerEmail) {
        return;
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`nfc-alert:${scanningClinicId}:${pet.id}:${todayStr}`)
        .digest('hex');

      const existing = await this.prisma.notification.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        this.logger.log(
          `[Aviso al Dueño NFC] Aviso ya procesado hoy para mascota ${pet.id} y clínica ${scanningClinicId}.`,
        );
        return;
      }

      let clinicName = 'Una clínica veterinaria';
      try {
        const clinic = await this.prisma.clinic.findUnique({
          where: { id: scanningClinicId },
          select: { name: true },
        });
        if (clinic?.name) {
          clinicName = clinic.name;
        }
      } catch {
        // Ignorar fallo de consulta de nombre
      }

      const petName = pet.name || 'su mascota';
      const scanDate = new Date().toLocaleString('es-ES', { timeZone: 'UTC' });
      const subject = `Aviso de lectura de chapa de ${petName}`;
      const content =
        `Hola,\n\n` +
        `Le informamos que la chapa NFC de su mascota "${petName}" ha sido leída en la clínica "${clinicName}" el ${scanDate} UTC.\n\n` +
        `Si usted no autorizó esta atención o tiene dudas, por favor comuníquese de inmediato con su clínica habitual.\n\n` +
        `Atentamente,\nEquipo VetApp`;

      let notificationRecord;
      try {
        notificationRecord = await this.prisma.notification.create({
          data: {
            idempotencyKey,
            type: NotificationType.NFC_SCAN_ALERT,
            entityId: pet.id,
            recipient: ownerEmail,
            targetDate: new Date(),
            status: NotificationStatus.PENDING,
          },
        });
      } catch (err: unknown) {
        const errObj = err as { code?: string; message?: string };
        if (errObj?.code === 'P2002' || errObj?.message?.includes('Unique constraint')) {
          this.logger.log(`[Aviso al Dueño NFC] Aviso ya registrado por concurrencia (${idempotencyKey}).`);
          return;
        }
        throw err;
      }

      if (this.mailTransportService && notificationRecord) {
        try {
          const sent = await this.mailTransportService.send(ownerEmail, subject, content);
          if (sent) {
            await this.prisma.notification.update({
              where: { id: notificationRecord.id },
              data: {
                status: NotificationStatus.SENT,
                sentAt: new Date(),
              },
            });
            this.logger.log(`[Aviso al Dueño NFC] Correo enviado exitosamente a ${ownerEmail}.`);
          } else {
            await this.prisma.notification.update({
              where: { id: notificationRecord.id },
              data: {
                status: NotificationStatus.FAILED,
                errorMessage: 'Fallo al despachar correo en transporte',
              },
            });
            this.logger.warn(`[Aviso al Dueño NFC] Fallo en transporte de correo hacia ${ownerEmail}.`);
          }
        } catch (mailErr: unknown) {
          const mErr = mailErr as Error;
          await this.prisma.notification.update({
            where: { id: notificationRecord.id },
            data: {
              status: NotificationStatus.FAILED,
              errorMessage: mErr?.message || 'Error desconocido de transporte',
            },
          });
          this.logger.warn(`[Aviso al Dueño NFC] Excepción en transporte hacia ${ownerEmail}: ${mErr?.message}`);
        }
      }
    } catch (err: unknown) {
      const gErr = err as Error;
      this.logger.warn(`[Aviso al Dueño NFC] Excepción capturada en sendOwnerNfcAlertAsync: ${gErr?.message}`);
    }
  }
}
