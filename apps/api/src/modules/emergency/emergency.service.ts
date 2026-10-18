import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessAction, TagStatus } from '@prisma/client';
import { PetSpecies } from '@vet-app/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessLogsService } from '../audit/access-logs.service';
import { EmergencyPetProfileDto } from './dto/emergency-pet-profile.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Servicio de resolución de contingencia y rescate ciudadano (/emergency/:publicCode).
 * Cumple estrictamente con RF-35, RF-36, RF-37 y RF-38.
 */
@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessLogsService: AccessLogsService,
  ) {}

  /**
   * Resuelve el perfil público sanitizado de una mascota mediante su código UUID de emergencia (RF-35 a RF-38).
   *
   * @param publicCode Código UUID v4 público grabado en el llavero/QR de emergencia.
   * @param ipAddress Dirección IP pública capturada de la solicitud entrante (RF-37).
   * @param userAgent Cadena User-Agent del navegador o cliente que realiza la consulta (RF-37).
   * @returns Perfil de emergencia sanitizado con restricción absoluta de datos confidenciales (RF-36).
   */
  async getEmergencyProfile(
    publicCode: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EmergencyPetProfileDto> {
    // Valida formato UUID de publicCode para evitar excepciones no controladas de BD (RF-38).
    if (!publicCode || !UUID_REGEX.test(publicCode)) {
      throw new NotFoundException('Código de emergencia no encontrado o inactivo');
    }

    // Busca el tag activo con la mascota y el dueño asociados
    const tag = await this.prisma.tag.findFirst({
      where: {
        publicCode,
        status: TagStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        pet: {
          include: {
            owner: true,
            visits: {
              include: {
                clinic: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
            accessGrants: {
              include: {
                clinic: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        },
      },
    });

    // Si el tag no existe, no está activo o tiene borrado lógico -> 404 (RF-38)
    if (!tag) {
      throw new NotFoundException('Código de emergencia no encontrado o inactivo');
    }

    // Si la mascota vinculada no existe o tiene borrado lógico -> 404 (RF-38)
    if (!tag.petId || !tag.pet || tag.pet.deletedAt !== null) {
      throw new NotFoundException('Mascota no encontrada o inactiva');
    }

    // Inserta inmediatamente una traza inmutable en AccessLog con acción EMERGENCY_SCAN (RF-37)
    await this.accessLogsService.log({
      petId: tag.petId,
      action: AccessAction.EMERGENCY_SCAN,
      ipAddress,
      userAgent,
      clinicId: null,
      userId: null,
    });

    // Determina la clínica de cabecera / referencia
    const primaryClinic =
      tag.pet.visits?.[0]?.clinic ??
      tag.pet.accessGrants?.[0]?.clinic ??
      (await this.prisma.clinic.findFirst({
        where: {
          deletedAt: null,
        },
      }));

    const clinicName = primaryClinic?.name ?? 'Clínica Veterinaria Central';
    const clinicPhone = primaryClinic?.phone ?? null;

    // Serialización estricta: exclusivamente datos permitidos por RF-36
    return {
      petName: tag.pet.name,
      species: tag.pet.species as unknown as PetSpecies,
      breed: tag.pet.breed ?? null,
      ownerName: `${tag.pet.owner.name} ${tag.pet.owner.lastName}`.trim(),
      ownerPhone: tag.pet.owner.phone,
      ownerSecondaryPhone: null,
      clinicName,
      clinicPhone,
    };
  }
}
