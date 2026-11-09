import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WhatsNewManager } from '../../electron/whats-new.manager.ts';
import { getReleaseNotesForVersion, RELEASE_NOTES } from '../../src/data/release-notes.ts';

describe('Gestor de Novedades de Versión (whats-new.manager.ts & release-notes.ts)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vet-app-whats-new-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza en Windows
    }
  });

  it('instalación limpia: inicializa release-state.json con la versión actual y no muestra el modal', () => {
    const manager = new WhatsNewManager({
      storageDir: tempDir,
      currentVersion: '0.1.1',
    });

    const status = manager.getStatus();

    assert.strictEqual(status.showWhatsNew, false, 'No debe mostrar novedades en una instalación limpia');
    assert.strictEqual(status.currentVersion, '0.1.1');
    assert.strictEqual(status.lastSeenVersion, '0.1.1');

    const filePath = path.join(tempDir, 'release-state.json');
    assert.ok(fs.existsSync(filePath), 'El archivo release-state.json debe haberse creado');

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(raw.currentVersion, '0.1.1');
    assert.strictEqual(raw.lastSeenVersion, '0.1.1');
  });

  it('actualización de versión: detecta versión anterior y activa showWhatsNew: true', () => {
    const filePath = path.join(tempDir, 'release-state.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentVersion: '0.1.0',
        lastSeenVersion: '0.1.0',
        updatedAt: '2026-11-01T00:00:00.000Z',
      }),
      'utf-8'
    );

    const manager = new WhatsNewManager({
      storageDir: tempDir,
      currentVersion: '0.1.1',
    });

    const status = manager.getStatus();

    assert.strictEqual(status.showWhatsNew, true, 'Debe activar novedades si lastSeenVersion < currentVersion');
    assert.strictEqual(status.currentVersion, '0.1.1');
    assert.strictEqual(status.lastSeenVersion, '0.1.0');
  });

  it('markSeen actualiza lastSeenVersion y la siguiente consulta retorna showWhatsNew: false', () => {
    const filePath = path.join(tempDir, 'release-state.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentVersion: '0.1.0',
        lastSeenVersion: '0.1.0',
      }),
      'utf-8'
    );

    const manager = new WhatsNewManager({
      storageDir: tempDir,
      currentVersion: '0.1.1',
    });

    // Primera llamada detecta actualización
    assert.strictEqual(manager.getStatus().showWhatsNew, true);

    // Usuario cierra el modal y marca como visto
    manager.markSeen('0.1.1');

    // Siguiente llamada
    const nextStatus = manager.getStatus();
    assert.strictEqual(nextStatus.showWhatsNew, false);
    assert.strictEqual(nextStatus.lastSeenVersion, '0.1.1');

    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(persisted.lastSeenVersion, '0.1.1');
    assert.strictEqual(persisted.currentVersion, '0.1.1');
  });

  it('recuperación ante archivo de estado corrupto o JSON inválido sin lanzar excepciones', () => {
    const filePath = path.join(tempDir, 'release-state.json');
    fs.writeFileSync(filePath, '{ corrupt_json: invalid! ', 'utf-8');

    const manager = new WhatsNewManager({
      storageDir: tempDir,
      currentVersion: '0.1.1',
    });

    // No debe lanzar excepción y debe inicializar estado seguro
    assert.doesNotThrow(() => {
      const status = manager.getStatus();
      assert.strictEqual(status.showWhatsNew, false);
      assert.strictEqual(status.currentVersion, '0.1.1');
    });
  });

  describe('Diccionario de Notas de Versión (release-notes.ts)', () => {
    it('debe contener notas estructuradas en español para la versión 0.1.1', () => {
      const notes011 = getReleaseNotesForVersion('0.1.1');
      assert.ok(notes011, 'Deben existir notas para v0.1.1');
      assert.strictEqual(notes011?.version, '0.1.1');
      assert.ok(notes011?.title.includes('0.1.1'));
      assert.ok(Array.isArray(notes011?.highlights));
      assert.ok(notes011.highlights.length >= 3, 'Debe incluir al menos 3 puntos destacados');

      // Comprueba mención a búsqueda rápida Ctrl+K
      const hasQuickSearch = notes011.highlights.some((h) => h.includes('Ctrl+K') || h.includes('búsqueda rápida'));
      assert.ok(hasQuickSearch, 'Debe destacar la paleta de búsqueda rápida con atajo Ctrl+K');

      // Comprueba que no contiene emojis (regla de interfaz sobria)
      for (const highlight of notes011.highlights) {
        assert.doesNotMatch(highlight, /[\u{1F300}-\u{1F9FF}]/u, 'No debe contener emojis');
      }
    });

    it('retorna undefined para versiones inexistentes', () => {
      const notes = getReleaseNotesForVersion('99.9.9');
      assert.strictEqual(notes, undefined);
    });

    it('debe tener notas históricas para versión 0.1.0', () => {
      const notes010 = getReleaseNotesForVersion('0.1.0');
      assert.ok(notes010);
      assert.strictEqual(notes010?.version, '0.1.0');
    });
  });
});
