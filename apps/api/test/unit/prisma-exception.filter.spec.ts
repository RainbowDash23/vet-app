import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from '../../src/common/filters/prisma-exception.filter';

interface MockResponse {
  statusCode: number;
  body: {
    statusCode: number;
    message: string;
    error?: string;
    timestamp?: string;
    path?: string;
    target?: unknown;
  } | null;
  status(code: number): MockResponse;
  json(data: any): MockResponse;
}

interface MockRequest {
  url: string;
  method: string;
}

describe('PrismaExceptionFilter (T06 / RF-8, RF-15, RF-19, RF-31, RF-55)', () => {
  let filter: PrismaExceptionFilter;
  let mockResponse: MockResponse;
  let mockRequest: MockRequest;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();

    mockResponse = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
    };

    mockRequest = {
      url: '/test-endpoint',
      method: 'POST',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as any,
        getRequest: () => mockRequest as any,
        getNext: () => {},
      }),
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => null as any,
      switchToWs: () => null as any,
      getType: () => 'http',
    } as unknown as ArgumentsHost;
  });

  describe('a) Código P2002 - Unique constraint failed (RF-8, RF-15, RF-31)', () => {
    it('debe retornar HTTP 409 Conflict ante error P2002 con mensaje explicativo de duplicidad', () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`code`)',
        {
          code: 'P2002',
          clientVersion: '6.4.1',
          meta: { target: ['code'] },
        },
      );

      filter.catch(error, mockHost);

      assert.strictEqual(mockResponse.statusCode, HttpStatus.CONFLICT);
      assert.ok(mockResponse.body, 'Debe emitir un cuerpo JSON');
      assert.strictEqual(mockResponse.body?.statusCode, HttpStatus.CONFLICT);
      assert.strictEqual(mockResponse.body?.error, 'Conflict');
      assert.ok(
        mockResponse.body?.message.toLowerCase().includes('duplic') ||
        mockResponse.body?.message.toLowerCase().includes('unic') ||
        mockResponse.body?.message.toLowerCase().includes('ya existe'),
        `El mensaje "${mockResponse.body?.message}" debe indicar conflicto de unicidad/duplicidad`,
      );
      assert.strictEqual(mockResponse.body?.path, '/test-endpoint');
    });
  });

  describe('b) Código P2003 - Foreign key constraint failed (RF-19)', () => {
    it('debe retornar HTTP 409 Conflict ante error P2003 indicando violación de integridad referencial', () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: (`owner_id`)',
        {
          code: 'P2003',
          clientVersion: '6.4.1',
          meta: { field_name: 'owner_id' },
        },
      );

      filter.catch(error, mockHost);

      assert.strictEqual(mockResponse.statusCode, HttpStatus.CONFLICT);
      assert.ok(mockResponse.body, 'Debe emitir un cuerpo JSON');
      assert.strictEqual(mockResponse.body?.statusCode, HttpStatus.CONFLICT);
      assert.strictEqual(mockResponse.body?.error, 'Conflict');
      assert.ok(
        mockResponse.body?.message.toLowerCase().includes('referencial') ||
        mockResponse.body?.message.toLowerCase().includes('integridad') ||
        mockResponse.body?.message.toLowerCase().includes('relacionado'),
        `El mensaje "${mockResponse.body?.message}" debe indicar violación de integridad referencial`,
      );
    });
  });

  describe('c) Código P2025 - Record not found', () => {
    it('debe retornar HTTP 404 Not Found ante error P2025 cuando el registro requerido no existe', () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        {
          code: 'P2025',
          clientVersion: '6.4.1',
          meta: { cause: 'Record to update not found.' },
        },
      );

      filter.catch(error, mockHost);

      assert.strictEqual(mockResponse.statusCode, HttpStatus.NOT_FOUND);
      assert.ok(mockResponse.body, 'Debe emitir un cuerpo JSON');
      assert.strictEqual(mockResponse.body?.statusCode, HttpStatus.NOT_FOUND);
      assert.strictEqual(mockResponse.body?.error, 'Not Found');
      assert.ok(
        mockResponse.body?.message.toLowerCase().includes('no encontrado') ||
        mockResponse.body?.message.toLowerCase().includes('no existe') ||
        mockResponse.body?.message.toLowerCase().includes('not found'),
        `El mensaje "${mockResponse.body?.message}" debe indicar que el registro no fue encontrado`,
      );
    });
  });

  describe('d) Otros códigos Prisma o errores no manejados', () => {
    it('debe mapear cualquier otro código de Prisma a HTTP 500 sin exponer detalles sensibles ni cadenas de conexión', () => {
      const sensitiveInfo = 'postgresql://user:super_secret_password@db-host:5432/vetdb';
      const error = new Prisma.PrismaClientKnownRequestError(
        `Database connection timeout or internal failure at ${sensitiveInfo}`,
        {
          code: 'P2000',
          clientVersion: '6.4.1',
        },
      );

      filter.catch(error, mockHost);

      assert.strictEqual(mockResponse.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
      assert.ok(mockResponse.body, 'Debe emitir un cuerpo JSON');
      assert.strictEqual(mockResponse.body?.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
      assert.strictEqual(mockResponse.body?.error, 'Internal Server Error');
      assert.ok(
        !JSON.stringify(mockResponse.body).includes('super_secret_password'),
        'No debe filtrar contraseñas o secretos en la respuesta',
      );
    });

    it('debe manejar errores desconocidos sin romper el formato estándar', () => {
      const genericError = new Error('Unexpected database driver panic');

      filter.catch(genericError, mockHost);

      assert.strictEqual(mockResponse.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
      assert.strictEqual(mockResponse.body?.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
