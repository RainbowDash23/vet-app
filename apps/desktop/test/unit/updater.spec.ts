import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { UpdaterManager } from '../../electron/updater.manager.ts';
import type { IAutoUpdater } from '../../electron/updater.manager.ts';
import type { UpdateStatusPayload } from '@vet-app/shared-types';

class MockAutoUpdater extends EventEmitter implements IAutoUpdater {
  public allowPrerelease = true;
  public allowDowngrade = true;
  public autoDownload = false;
  public autoInstallOnAppQuit = true;

  public checkCalls = 0;
  public quitAndInstallCalls = 0;
  public lastQuitAndInstallArgs: { isSilent?: boolean; isForceRunAfter?: boolean } | null = null;
  public simulateCheckError: Error | null = null;

  public async checkForUpdates(): Promise<unknown> {
    this.checkCalls++;
    if (this.simulateCheckError) {
      throw this.simulateCheckError;
    }
    this.emit('checking-for-update');
    return {};
  }

  public quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quitAndInstallCalls++;
    this.lastQuitAndInstallArgs = { isSilent, isForceRunAfter };
  }
}

describe('Gestor de Actualizaciones Automáticas (updater.manager.ts)', () => {
  let mockUpdater: MockAutoUpdater;

  beforeEach(() => {
    mockUpdater = new MockAutoUpdater();
  });

  it('en modo desarrollo (isPackaged: false) debe omitir comprobación y llamar onReady inmediatamente', () => {
    let readyCalled = false;
    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: false,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(() => {
      readyCalled = true;
    });

    assert.strictEqual(readyCalled, true, 'onReady debe ser invocado inmediatamente');
    assert.strictEqual(mockUpdater.checkCalls, 0, 'No debe invocar checkForUpdates en desarrollo');
    assert.strictEqual(manager.getState(), 'idle');
  });

  it('en modo empaquetado debe fijar allowPrerelease: false, allowDowngrade: false y autoDownload: true', () => {
    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(() => {});

    assert.strictEqual(mockUpdater.allowPrerelease, false, 'allowPrerelease debe ser false');
    assert.strictEqual(mockUpdater.allowDowngrade, false, 'allowDowngrade debe ser false');
    assert.strictEqual(mockUpdater.autoDownload, true, 'autoDownload debe ser true');
    assert.strictEqual(mockUpdater.autoInstallOnAppQuit, false);
    assert.strictEqual(mockUpdater.checkCalls, 1);
  });

  it('cuando no hay actualización disponible (update-not-available) debe notificar y llamar onReady', () => {
    let readyCalled = false;
    const statusEvents: UpdateStatusPayload[] = [];

    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(
      () => {
        readyCalled = true;
      },
      (payload) => {
        statusEvents.push(payload);
      },
    );

    mockUpdater.emit('update-not-available');

    assert.strictEqual(readyCalled, true);
    assert.strictEqual(manager.getState(), 'not-available');
    assert.ok(statusEvents.some((s) => s.state === 'checking'));
    assert.ok(statusEvents.some((s) => s.state === 'not-available'));
  });

  it('cuando ocurre un error de red debe registrar error y llamar onReady para no bloquear el inicio', () => {
    let readyCalled = false;
    const statusEvents: UpdateStatusPayload[] = [];

    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(
      () => {
        readyCalled = true;
      },
      (payload) => {
        statusEvents.push(payload);
      },
    );

    mockUpdater.emit('error', new Error('ENOTFOUND github.com'));

    assert.strictEqual(readyCalled, true);
    assert.strictEqual(manager.getState(), 'error');
    const errEvent = statusEvents.find((s) => s.state === 'error');
    assert.ok(errEvent);
    assert.ok(errEvent.error?.includes('ENOTFOUND'));
  });

  it('cuando se supera el timeout de 10s sin respuesta debe invocar onReady', (t, done) => {
    let readyCalled = false;

    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      timeoutMs: 50, // 50ms para la prueba unitaria
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(() => {
      readyCalled = true;
      assert.strictEqual(manager.getState(), 'not-available');
      done();
    });
  });

  it('flujo completo de actualización encontrada, descarga con progreso y reinicio', () => {
    let readyCalled = false;
    const statusEvents: UpdateStatusPayload[] = [];

    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      timeoutMs: 1000,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(
      () => {
        readyCalled = true;
      },
      (payload) => {
        statusEvents.push(payload);
      },
    );

    // 1. Notificación de nueva versión
    mockUpdater.emit('update-available', { version: '0.2.0' });
    assert.strictEqual(manager.getState(), 'available');
    assert.strictEqual(readyCalled, false, 'No debe llamar a onReady mientras descarga');

    // 2. Progreso de descarga
    mockUpdater.emit('download-progress', { percent: 45.2 });
    assert.strictEqual(manager.getState(), 'downloading');
    assert.strictEqual(manager.getStatusPayload().percent, 45);

    // 3. Descarga completada
    mockUpdater.emit('update-downloaded', { version: '0.2.0' });
    assert.strictEqual(manager.getState(), 'downloaded');

    // 4. Reiniciar e instalar en modo silencioso para no mostrar el asistente
    manager.restartAndInstall();
    assert.strictEqual(mockUpdater.quitAndInstallCalls, 1);
    assert.strictEqual(mockUpdater.lastQuitAndInstallArgs?.isSilent, true, 'quitAndInstall debe ejecutarse con isSilent: true');
    assert.strictEqual(mockUpdater.lastQuitAndInstallArgs?.isForceRunAfter, true, 'quitAndInstall debe ejecutarse con isForceRunAfter: true');
  });

  it('restartAndInstall debe forzar modo silencioso (isSilent: true, isForceRunAfter: true) para evitar asistente NSIS en actualizaciones', () => {
    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(() => {});
    mockUpdater.emit('update-available', { version: '1.0.0' });
    mockUpdater.emit('update-downloaded', { version: '1.0.0' });

    manager.restartAndInstall();

    assert.strictEqual(mockUpdater.quitAndInstallCalls, 1);
    assert.deepStrictEqual(mockUpdater.lastQuitAndInstallArgs, {
      isSilent: true,
      isForceRunAfter: true,
    });
  });

  it('skip() debe invocar onReady para continuar sin actualizar', () => {
    let readyCalled = false;

    const manager = new UpdaterManager({
      updater: mockUpdater,
      isPackaged: true,
      currentVersion: '0.1.0',
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    });

    manager.start(() => {
      readyCalled = true;
    });

    manager.skip();
    assert.strictEqual(readyCalled, true);
  });
});
