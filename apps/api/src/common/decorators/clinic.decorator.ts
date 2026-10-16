import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export interface RequestWithUser {
  user?: {
    clinicId?: string;
    userId?: string;
    email?: string;
    role?: string;
    [key: string]: unknown;
  };
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * Función pura de extracción segura de clinicId.
 * Extrae determinísticamente el identificador de la clínica exclusivamente
 * de los claims criptográficos validados en request.user, ignorando
 * y previniendo cualquier inyección manual proveniente de request.body o request.query (RF-9, RNF-8).
 */
export function extractClinicIdFromRequest(req: RequestWithUser): string {
  const clinicId = req?.user?.clinicId;
  if (!clinicId || typeof clinicId !== 'string' || clinicId.trim() === '') {
    throw new UnauthorizedException(
      'Identificador de clínica no encontrado o inválido en la sesión autenticada',
    );
  }
  return clinicId;
}

/**
 * Decorador de parámetro @CurrentClinicId():
 * Inyecta el clinicId del usuario autenticado en la firma del método del controlador.
 */
export const CurrentClinicId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return extractClinicIdFromRequest(request);
  },
);

/**
 * Decorador de parámetro @CurrentClinic():
 * Inyecta el clinicId del usuario autenticado en la firma del método del controlador.
 */
export const CurrentClinic = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return extractClinicIdFromRequest(request);
  },
);
