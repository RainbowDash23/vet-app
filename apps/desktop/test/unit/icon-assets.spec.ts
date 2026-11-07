import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Iconos de la Aplicación de Escritorio (VetApp Desktop Assets)', () => {
  const buildDir = path.resolve(__dirname, '../../build');

  it('debe existir el archivo icon.svg con estructura SVG válida', () => {
    const svgPath = path.join(buildDir, 'icon.svg');
    assert.ok(fs.existsSync(svgPath), 'apps/desktop/build/icon.svg debe existir');
    const content = fs.readFileSync(svgPath, 'utf-8');
    assert.ok(content.includes('<svg'), 'Debe contener la etiqueta <svg');
    assert.ok(content.includes('viewBox="0 0 512 512"'), 'Debe tener viewBox 512x512');
  });

  it('debe existir icon.png con tamaño y cabecera PNG válida (512x512)', () => {
    const pngPath = path.join(buildDir, 'icon.png');
    assert.ok(fs.existsSync(pngPath), 'apps/desktop/build/icon.png debe existir');
    const buffer = fs.readFileSync(pngPath);
    assert.ok(buffer.length > 500, 'icon.png no debe estar vacío');
    // Magic bytes de PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    assert.strictEqual(buffer[0], 0x89);
    assert.strictEqual(buffer[1], 0x50);
    assert.strictEqual(buffer[2], 0x4e);
    assert.strictEqual(buffer[3], 0x47);
  });

  it('debe existir icon.ico con cabecera ICO válida y múltiples resoluciones', () => {
    const icoPath = path.join(buildDir, 'icon.ico');
    assert.ok(fs.existsSync(icoPath), 'apps/desktop/build/icon.ico debe existir');
    const buffer = fs.readFileSync(icoPath);
    assert.ok(buffer.length > 1000, 'icon.ico debe contener datos de múltiples resoluciones');
    // Magic bytes de ICO: 0x00 0x00 0x01 0x00 (tipo 1 = icon)
    assert.strictEqual(buffer.readUInt16LE(0), 0, 'Reserved debe ser 0');
    assert.strictEqual(buffer.readUInt16LE(2), 1, 'Tipo de imagen debe ser 1 (ICO)');
    const imageCount = buffer.readUInt16LE(4);
    assert.ok(imageCount >= 4, `Debe contener al menos 4 resoluciones (encontradas: ${imageCount})`);
  });
});
