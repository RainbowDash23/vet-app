import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessGrantsService } from '../../modules/pets/access-grants.service';

export interface RequestUserWithClinic {
  clinicId?: string;
  [key: string]: unknown;
}

/**
 * Guardia de consentimiento médico temporal multi-clínica (AccessGrant).
 *
 * Verifica la existencia de un AccessGrant activo y vigente para (petId, clinicId)
 * antes de permitir el acceso a historias clínicas, diagnósticos o consultas médicas.
 *
 * Cumple con RF-24 y RNF-8.
 */
@Injectable()
export class AccessGrantGuard implements CanActivate {
  constructor(private readonly accessGrantsService: AccessGrantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        params?: Record<string, string>;
        user?: RequestUserWithClinic;
      }
    >();

    const petId = request.params?.petId || request.params?.id;
    const clinicId = request.user?.clinicId;

    if (!petId || !clinicId) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
      );
    }

    const hasGrant = await this.accessGrantsService.hasActiveGrant(petId, clinicId);

    if (!hasGrant) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
      );
    }

    return true;
  }
}
