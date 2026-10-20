import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Auditoría Estática de Controladores: Política Fail-Closed de clinicId', () => {
  const modulesDir = path.resolve(__dirname, '../../src/modules');

  function getControllerFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getControllerFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('ningún controlador debe declarar @CurrentClinicId() clinicId?: (opcional sin tipado estricto requerido)', () => {
    const controllers = getControllerFiles(modulesDir);
    assert.ok(controllers.length > 0, 'Deben existir archivos de controladores en src/modules');

    const violations: { file: string; line: number; content: string }[] = [];
    // Detecta @CurrentClinicId(...) clinicId?:
    const optionalPattern = /@CurrentClinicId\s*\([^)]*\)\s+([a-zA-Z0-9_]+)\s*\?:/g;

    for (const file of controllers) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (optionalPattern.test(line) || /@CurrentClinicId\s*\([^)]*\)\s+clinicId\s*\?:/.test(line)) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '../..'), file),
            line: idx + 1,
            content: line.trim(),
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Se detectaron parámetros opcionales con @CurrentClinicId():\n${JSON.stringify(violations, null, 2)}`,
    );
  });

  it('ningún controlador debe aplicar fallback inseguro clinicId ||', () => {
    const controllers = getControllerFiles(modulesDir);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of controllers) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Detecta patrones como `clinicId ||`, `query?.clinicId || clinicId`, `clinicId || query?.clinicId`
        if (/\bclinicId\s*\|\|/.test(line) || /\|\|\s*clinicId\b/.test(line)) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '../..'), file),
            line: idx + 1,
            content: line.trim(),
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Se detectaron operadores de fallback inseguros con clinicId:\n${JSON.stringify(violations, null, 2)}`,
    );
  });
});
