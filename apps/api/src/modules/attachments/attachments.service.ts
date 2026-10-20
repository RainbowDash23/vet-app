import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Attachment, GrantScope } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessGrantsService } from '../pets/access-grants.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/dicom',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface FileUploadPayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

/**
 * Servicio de almacenamiento seguro y descarga controlada de archivos clínicos adjuntos (RF-49, RF-50, RNF-8).
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessGrantsService: AccessGrantsService,
  ) {}

  /**
   * Valida que el archivo cumpla con los tipos MIME autorizados y el límite de tamaño de 10 MB (RF-49).
   */
  validateFile(file: { mimetype: string; size: number }): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y DICOM',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        'El archivo excede el tamaño máximo permitido de 10 MB',
      );
    }
  }

  /**
   * Carga y persiste los metadatos de un archivo adjunto clínico (RF-49).
   * Almacena fuera del directorio web público y vincula de forma opcional con mascota o visita.
   */
  async uploadAttachment(
    userId: string,
    clinicId: string,
    file: FileUploadPayload,
    dto: UploadAttachmentDto,
  ): Promise<Attachment> {
    // 1. Valida el tipo MIME y tamaño
    this.validateFile(file);

    // 2. Si se proporciona petId, valida existencia, actividad y autorización
    if (dto.petId) {
      const pet = await this.prisma.pet.findFirst({
        where: {
          id: dto.petId,
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
        dto.petId,
        clinicId,
        GrantScope.FULL_HISTORY,
      );

      if (!isOrigin && !hasVisitsInClinic && !hasGrant) {
        throw new NotFoundException('Mascota no encontrada o no autorizada');
      }
    }

    // 3. Si se proporciona visitId, valida existencia y actividad en la clínica
    if (dto.visitId) {
      const visit = await this.prisma.visit.findFirst({
        where: {
          id: dto.visitId,
          clinicId,
          deletedAt: null,
        },
      });

      if (!visit) {
        throw new NotFoundException('Visita no encontrada o inactiva');
      }
    }

    // 4. Genera una ruta segura de almacenamiento en directorio privado
    const fileExt = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${randomUUID()}${fileExt}`;
    const safeStoragePath = path.posix.join('uploads', 'attachments', safeFilename);

    // 5. Persiste el registro en la base de datos
    return this.prisma.attachment.create({
      data: {
        filename: path.basename(file.originalname),
        storagePath: safeStoragePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        description: dto.description?.trim() || null,
        uploadedById: userId,
        petId: dto.petId || null,
        visitId: dto.visitId || null,
      },
    });
  }

  /**
   * Obtiene los datos del archivo adjunto para su descarga o visualización (RF-50, RNF-8).
   * Supedita el acceso a la vigencia de un AccessGrant a favor de la clínica solicitante.
   */
  async getAttachmentForDownload(
    attachmentId: string,
    clinicId: string,
  ): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Archivo adjunto no encontrado');
    }

    // Si el adjunto está vinculado a una mascota, verifica vigencia de AccessGrant
    if (attachment.petId) {
      const hasGrant = await this.accessGrantsService.hasActiveGrant(
        attachment.petId,
        clinicId,
        GrantScope.FULL_HISTORY,
      );

      if (!hasGrant) {
        throw new ForbiddenException(
          'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para acceder a los archivos clínicos de este paciente',
        );
      }
    }

    return attachment;
  }

  /**
   * Consulta los archivos adjuntos activos de una mascota bajo consentimiento (AccessGrant) vigente (RF-50, RNF-8).
   */
  async findByPetId(petId: string, clinicId: string): Promise<Attachment[]> {
    const hasGrant = await this.accessGrantsService.hasActiveGrant(
      petId,
      clinicId,
      GrantScope.FULL_HISTORY,
    );

    if (!hasGrant) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para acceder a los archivos clínicos de este paciente',
      );
    }

    return this.prisma.attachment.findMany({
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
   * Borrado lógico de un archivo adjunto clínico (RF-49, RF-63).
   * Restringido a la clínica propietaria de la atención o paciente.
   */
  async softDelete(attachmentId: string, _userId: string, clinicId: string): Promise<Attachment> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        deletedAt: null,
      },
      include: {
        pet: {
          include: {
            visits: { where: { deletedAt: null } },
          },
        },
        visit: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Archivo adjunto no encontrado');
    }

    let isAuthorized = false;
    if (attachment.visit && attachment.visit.clinicId === clinicId) {
      isAuthorized = true;
    } else if (attachment.pet) {
      const isOrigin = attachment.pet.createdByClinicId === clinicId;
      const hasVisitsInClinic = attachment.pet.visits?.some((v: any) => v.clinicId === clinicId);
      if (isOrigin || hasVisitsInClinic) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new NotFoundException('Archivo adjunto no encontrado');
    }

    return this.prisma.attachment.update({
      where: {
        id: attachmentId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
