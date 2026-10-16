import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorador de autorización basado en roles (RBAC).
 * Asigna los roles permitidos para acceder al controlador o método.
 *
 * @param roles Lista de roles requeridos (ADMIN, VET, RECEPTION).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
