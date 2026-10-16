import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { PaginationInterceptor } from '../src/common/interceptors/pagination.interceptor';

describe('T06 - Infraestructura Global de Validación, Filtros e Interceptores (RF-8, RF-15, RF-19, RF-55, RF-57)', () => {
  describe('a) Configuración de ValidationPipe e interceptores globales en main.ts (RF-55)', () => {
    it('debe registrar ValidationPipe con whitelist, forbidNonWhitelisted y transform', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const content = fs.readFileSync(mainPath, 'utf8');

      assert.ok(content.includes('whitelist: true'), 'Debe incluir whitelist: true');
      assert.ok(content.includes('forbidNonWhitelisted: true'), 'Debe incluir forbidNonWhitelisted: true');
      assert.ok(content.includes('transform: true'), 'Debe incluir transform: true');
      assert.ok(content.includes('PrismaExceptionFilter'), 'Debe instanciar/aplicar PrismaExceptionFilter');
      assert.ok(content.includes('PaginationInterceptor'), 'Debe instanciar/aplicar PaginationInterceptor');
    });
  });

  describe('b) Existencia e instanciabilidad de los componentes', () => {
    it('debe instanciar PrismaExceptionFilter correctamente', () => {
      const filter = new PrismaExceptionFilter();
      assert.ok(filter, 'PrismaExceptionFilter debe instanciarse');
      assert.strictEqual(typeof filter.catch, 'function');
    });

    it('debe instanciar PaginationInterceptor correctamente', () => {
      const interceptor = new PaginationInterceptor();
      assert.ok(interceptor, 'PaginationInterceptor debe instanciarse');
      assert.strictEqual(typeof interceptor.intercept, 'function');
    });
  });
});
