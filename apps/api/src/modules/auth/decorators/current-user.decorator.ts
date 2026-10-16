import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Extrae los datos del usuario autenticado previamente validados e inyectados por JwtAuthGuard.
 * Puede utilizarse completo: @CurrentUser() user: AuthenticatedUser
 * O extrayendo una propiedad específica: @CurrentUser('clinicId') clinicId: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);

/**
 * Acceso directo y seguro al clinicId extraído exclusivamente del token JWT
 */
export const CurrentClinicId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user?.clinicId;
  },
);

/**
 * Acceso directo al userId extraído exclusivamente del token JWT
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user?.userId;
  },
);
