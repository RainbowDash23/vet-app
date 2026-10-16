import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginatedResult, PaginationMeta } from '@vet-app/shared-types';
import { Request } from 'express';

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const query = (request?.query || {}) as Record<string, string | undefined>;

    return next.handle().pipe(
      map((data: unknown) => {
        if (!data || typeof data !== 'object') {
          return data;
        }

        // Caso 1: Estructura tupla [items, total] devuelta por consultas transaccionales de Prisma
        if (
          Array.isArray(data) &&
          data.length === 2 &&
          Array.isArray(data[0]) &&
          typeof data[1] === 'number'
        ) {
          const items = data[0];
          const total = data[1];
          const page = Math.max(1, Number(query.page) || 1);
          const limit = Math.max(1, Number(query.limit) || 10);
          const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);
          const hasNextPage = page < totalPages;
          const hasPrevPage = page > 1 && totalPages > 0;

          const meta: PaginationMeta = {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPrevPage,
          };

          return {
            data: items,
            meta,
          } as PaginatedResult<unknown>;
        }

        // Caso 2: Objeto que contiene { data: [...], total, page?, limit? }
        const obj = data as Record<string, any>;
        if (
          Array.isArray(obj.data) &&
          (typeof obj.total === 'number' || typeof obj.meta?.total === 'number')
        ) {
          const total = typeof obj.total === 'number' ? obj.total : Number(obj.meta?.total ?? 0);
          const page = Math.max(
            1,
            Number(obj.page ?? obj.meta?.page ?? query.page ?? 1),
          );
          const limit = Math.max(
            1,
            Number(obj.limit ?? obj.meta?.limit ?? query.limit ?? 10),
          );
          const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);
          const hasNextPage = page < totalPages;
          const hasPrevPage = page > 1 && totalPages > 0;

          const meta: PaginationMeta = {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPrevPage,
          };

          return {
            data: obj.data,
            meta,
          } as PaginatedResult<unknown>;
        }

        // Caso 3: Objeto que ya posee { data: [...], meta: { total, ... } }
        if (Array.isArray(obj.data) && obj.meta && typeof obj.meta.total === 'number') {
          const total = Number(obj.meta.total);
          const page = Math.max(1, Number(obj.meta.page ?? query.page ?? 1));
          const limit = Math.max(1, Number(obj.meta.limit ?? query.limit ?? 10));
          const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);
          const hasNextPage = page < totalPages;
          const hasPrevPage = page > 1 && totalPages > 0;

          const meta: PaginationMeta = {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPrevPage,
          };

          return {
            data: obj.data,
            meta,
          } as PaginatedResult<unknown>;
        }

        // Caso 4: No es una respuesta paginable (dejar pasar sin alteración)
        return data;
      }),
    );
  }
}
