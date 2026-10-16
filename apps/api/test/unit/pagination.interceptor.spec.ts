import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { PaginationInterceptor } from '../../src/common/interceptors/pagination.interceptor';
import { PaginatedResult } from '@vet-app/shared-types';

describe('PaginationInterceptor (T06 / RF-57)', () => {
  let interceptor: PaginationInterceptor;

  const createMockContext = (queryParams: Record<string, string> = {}): ExecutionContext => {
    const mockRequest = {
      query: queryParams,
      url: '/items?page=1&limit=10',
      method: 'GET',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
        getNext: () => {},
      }),
      getClass: () => null as any,
      getHandler: () => null as any,
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => null as any,
      switchToWs: () => null as any,
      getType: () => 'http',
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    interceptor = new PaginationInterceptor();
  });

  describe('a) Normalización de objeto con data, total, page y limit', () => {
    it('debe calcular correctamente totalPages, hasNextPage y hasPrevPage en la primera página', async () => {
      const mockHandler: CallHandler = {
        handle: () =>
          of({
            data: [{ id: 1 }, { id: 2 }],
            total: 25,
            page: 1,
            limit: 10,
          }),
      };

      const result$ = interceptor.intercept(createMockContext(), mockHandler);
      const result = (await firstValueFrom(result$)) as PaginatedResult<{ id: number }>;

      assert.ok(result, 'El resultado debe estar definido');
      assert.strictEqual(Array.isArray(result.data), true);
      assert.strictEqual(result.data.length, 2);

      assert.deepStrictEqual(result.meta, {
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false,
      });
    });

    it('debe calcular correctamente totalPages, hasNextPage y hasPrevPage en la última página', async () => {
      const mockHandler: CallHandler = {
        handle: () =>
          of({
            data: [{ id: 21 }, { id: 22 }],
            total: 25,
            page: 3,
            limit: 10,
          }),
      };

      const result$ = interceptor.intercept(createMockContext({ page: '3', limit: '10' }), mockHandler);
      const result = (await firstValueFrom(result$)) as PaginatedResult<{ id: number }>;

      assert.deepStrictEqual(result.meta, {
        total: 25,
        page: 3,
        limit: 10,
        totalPages: 3,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('debe calcular correctamente flags en una página intermedia', async () => {
      const mockHandler: CallHandler = {
        handle: () =>
          of({
            data: [{ id: 11 }, { id: 12 }],
            total: 30,
            page: 2,
            limit: 10,
          }),
      };

      const result$ = interceptor.intercept(createMockContext({ page: '2', limit: '10' }), mockHandler);
      const result = (await firstValueFrom(result$)) as PaginatedResult<{ id: number }>;

      assert.deepStrictEqual(result.meta, {
        total: 30,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('debe manejar adecuadamente un total de 0 elementos', async () => {
      const mockHandler: CallHandler = {
        handle: () =>
          of({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
          }),
      };

      const result$ = interceptor.intercept(createMockContext(), mockHandler);
      const result = (await firstValueFrom(result$)) as PaginatedResult<any>;

      assert.deepStrictEqual(result.meta, {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });

  describe('b) Normalización de tupla [items, total] común en consultas transaccionales', () => {
    it('debe extraer query params de la petición y estructurar { data, meta }', async () => {
      const mockHandler: CallHandler = {
        handle: () => of([[{ id: 'item-1' }], 15]),
      };

      const result$ = interceptor.intercept(createMockContext({ page: '2', limit: '5' }), mockHandler);
      const result = (await firstValueFrom(result$)) as PaginatedResult<{ id: string }>;

      assert.strictEqual(result.data.length, 1);
      assert.deepStrictEqual(result.meta, {
        total: 15,
        page: 2,
        limit: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });
  });

  describe('c) Pass-through para respuestas no paginables', () => {
    it('debe retornar objetos individuales o valores primitivos sin modificarlos', async () => {
      const entity = { id: 'pet-123', name: 'Bobby' };
      const mockHandler: CallHandler = {
        handle: () => of(entity),
      };

      const result$ = interceptor.intercept(createMockContext(), mockHandler);
      const result = await firstValueFrom(result$);

      assert.strictEqual(result, entity);
    });

    it('debe respetar respuestas nulas o indefinidas', async () => {
      const mockHandler: CallHandler = {
        handle: () => of(null),
      };

      const result$ = interceptor.intercept(createMockContext(), mockHandler);
      const result = await firstValueFrom(result$);

      assert.strictEqual(result, null);
    });
  });
});
