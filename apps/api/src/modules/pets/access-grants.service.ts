import { Injectable, NotFoundException } from '@nestjs/common';
import { GrantSource, GrantScope, AccessGrant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Servicio de gestión de consentimientos temporales de acceso médico multi-clínica (AccessGrant).
 * Cumple con RF-21, RF-22, RF-23, RF-24 y RNF-8.
 */
@Injectable()
export class AccessGrantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera o extiende un AccessGrant válido por exactamente durationHours (por defecto 24 horas).
   * Ante lecturas físicas NFC_TAP o derivaciones, otorga alcance FULL_HISTORY (RF-22).
   */
  async grantAccess(
    petId: string,
    clinicId: string,
    source: GrantSource = GrantSource.NFC_TAP,
    scope: GrantScope = GrantScope.FULL_HISTORY,
    durationHours = 24,
  ): Promise<AccessGrant> {
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: petId,
        deletedAt: null,
      },
    });

    if (!pet) {
      throw new NotFoundException(`Mascota con ID '${petId}' no encontrada o inactiva`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000);

    const existingGrant = await this.prisma.accessGrant.findFirst({
      where: {
        petId,
        clinicId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'desc' },
    });

    if (existingGrant) {
      return this.prisma.accessGrant.update({
        where: { id: existingGrant.id },
        data: {
          expiresAt,
          scope,
          source,
        },
      });
    }

    return this.prisma.accessGrant.create({
      data: {
        petId,
        clinicId,
        source,
        scope,
        grantedAt: now,
        expiresAt,
      },
    });
  }

  /**
   * Comprueba si existe un AccessGrant activo para (petId, clinicId)
   * con expiresAt > new Date() y revokedAt === null.
   * Si requiredScope es FULL_HISTORY, el grant debe tener scope FULL_HISTORY.
   * Si requiredScope es VACCINES_ONLY, tanto VACCINES_ONLY como FULL_HISTORY califican.
   */
  async hasActiveGrant(
    petId: string,
    clinicId: string,
    requiredScope?: GrantScope,
  ): Promise<boolean> {
    const grant = await this.getActiveGrant(petId, clinicId);

    if (!grant) {
      return false;
    }

    if (!requiredScope) {
      return true;
    }

    if (requiredScope === GrantScope.FULL_HISTORY) {
      return grant.scope === GrantScope.FULL_HISTORY;
    }

    if (requiredScope === GrantScope.VACCINES_ONLY) {
      return grant.scope === GrantScope.FULL_HISTORY || grant.scope === GrantScope.VACCINES_ONLY;
    }

    return false;
  }

  /**
   * Retorna el grant activo vigente o null si expiró, fue revocado o no existe.
   */
  async getActiveGrant(petId: string, clinicId: string): Promise<AccessGrant | null> {
    const now = new Date();
    return this.prisma.accessGrant.findFirst({
      where: {
        petId,
        clinicId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'desc' },
    });
  }

  /**
   * Filtra la información de la mascota según el consentimiento activo:
   * - hasGrant === false: limita el resultado a datos mínimos de filiación: nombre, especie,
   *   raza, sexo, teléfonos del dueño y estado del tag (RF-21).
   *   Cero historia médica, cero visitas, cero vacunas, cero notas, cero dirección del dueño.
   * - hasGrant === true: retorna la ficha con datos clínicos completos autorizados (RF-23).
   */
  filterPetDataByConsent(pet: any, hasGrant: boolean): any {
    if (hasGrant) {
      return pet;
    }

    const tagStatus = pet.tags?.[0]?.status ?? pet.tag?.status ?? null;
    const ownerPhone = pet.owner?.phone ?? null;

    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      ownerPhone,
      tagStatus,
      owner: pet.owner
        ? {
            name: pet.owner.name,
            lastName: pet.owner.lastName,
            phone: pet.owner.phone,
          }
        : null,
      tags: pet.tags?.map((t: any) => ({ status: t.status })) ?? [],
    };
  }

  /**
   * Revoca un consentimiento activo registrando revokedAt = now() y notas opcionales.
   */
  async revokeGrant(grantId: string, notes?: string): Promise<AccessGrant> {
    const grant = await this.prisma.accessGrant.findUnique({
      where: { id: grantId },
    });

    if (!grant) {
      throw new NotFoundException(`AccessGrant con ID '${grantId}' no encontrado`);
    }

    return this.prisma.accessGrant.update({
      where: { id: grantId },
      data: {
        revokedAt: new Date(),
        ...(notes !== undefined && { notes }),
      },
    });
  }
}
