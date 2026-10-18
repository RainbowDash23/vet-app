import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_WINDOW_OPTIONS,
  setupSerialEvents,
  registerIpcHandlers,
} from '../../electron/main.ts';
import { createElectronApi } from '../../electron/preload.ts';
import { SerialManager, InMemorySerialDriver } from '../../electron/serial.manager.ts';
import type { HardwareStatus } from '@vet-app/shared-types';

describe('Electron Main & Preload Security Suite (T27 / RNF-2 / RNF-6 / RF-27 / RF-34)', () => {
  describe('Configuración de BrowserWindow y Directivas de Seguridad (RNF-6)', () => {
    it('debe tener configurado webPreferences con nodeIntegration desactivado', () => {
      assert.strictEqual(
        DEFAULT_WINDOW_OPTIONS.webPreferences?.nodeIntegration,
        false,
        'nodeIntegration debe ser estrictamente false para prevenir ejecución de Node en renderer (RNF-6)',
      );
    });

    it('debe tener contextIsolation activado estrictamente en webPreferences', () => {
      assert.strictEqual(
        DEFAULT_WINDOW_OPTIONS.webPreferences?.contextIsolation,
        true,
        'contextIsolation debe ser estrictamente true para aislar contextos de ejecución (RNF-6)',
      );
    });

    it('debe tener sandbox activado en webPreferences', () => {
      assert.strictEqual(
        DEFAULT_WINDOW_OPTIONS.webPreferences?.sandbox,
        true,
        'sandbox debe ser true para restringir acceso a APIs nativas del sistema operativo (RNF-6)',
      );
    });

    it('debe resolver la ruta del preload hacia preload.js', () => {
      assert.ok(DEFAULT_WINDOW_OPTIONS.webPreferences?.preload);
      assert.ok(
        DEFAULT_WINDOW_OPTIONS.webPreferences.preload.endsWith('preload.js'),
        'La ruta de preload debe finalizar en preload.js',
      );
    });

    it('debe definir dimensiones seguras de ventana principal', () => {
      assert.strictEqual(DEFAULT_WINDOW_OPTIONS.width, 1200);
      assert.strictEqual(DEFAULT_WINDOW_OPTIONS.height, 800);
      assert.strictEqual(DEFAULT_WINDOW_OPTIONS.minWidth, 900);
      assert.strictEqual(DEFAULT_WINDOW_OPTIONS.minHeight, 600);
    });
  });

  describe('Precarga Segura e Interfaz ElectronAPI en preload.ts (RNF-6)', () => {
    let mockIpc: {
      listeners: Map<string, Function[]>;
      on: (channel: string, listener: Function) => void;
      removeListener: (channel: string, listener: Function) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      invocations: Array<{ channel: string; args: unknown[] }>;
    };

    beforeEach(() => {
      mockIpc = {
        listeners: new Map(),
        invocations: [],
        on(channel: string, listener: Function) {
          const list = this.listeners.get(channel) ?? [];
          list.push(listener);
          this.listeners.set(channel, list);
        },
        removeListener(channel: string, listener: Function) {
          const list = this.listeners.get(channel) ?? [];
          this.listeners.set(
            channel,
            list.filter((l) => l !== listener),
          );
        },
        async invoke(channel: string, ...args: unknown[]) {
          mockIpc.invocations.push({ channel, args });
          if (channel === 'hardware:get-status') {
            return {
              connected: true,
              portName: 'COM3',
              reconnecting: false,
              attemptCount: 0,
            } satisfies HardwareStatus;
          }
          if (channel === 'nfc:simulate-tag') {
            return { success: true, emittedUid: args[0] };
          }
          if (channel === 'system:get-app-info') {
            return { version: '0.1.0', platform: 'win32', arch: 'x64' };
          }
          return undefined;
        },
      };
    });

    it('debe crear una API que no exponga ipcRenderer, require ni process', () => {
      const api = createElectronApi(mockIpc as any);
      assert.strictEqual(typeof (api as any).require, 'undefined');
      assert.strictEqual(typeof (api as any).process, 'undefined');
      assert.strictEqual(typeof (api as any).ipcRenderer, 'undefined');
      assert.strictEqual(typeof (api as any).send, 'undefined');
      assert.strictEqual(typeof (api as any).on, 'undefined');
    });

    it('debe implementar onTagDetected suscribiéndose y permitiendo desuscripción limpia', () => {
      const api = createElectronApi(mockIpc as any);
      let receivedUid = '';
      const unsubscribe = api.onTagDetected((uid: string) => {
        receivedUid = uid;
      });

      assert.strictEqual(mockIpc.listeners.get('nfc:on-tag-detected')?.length, 1);

      // Simula evento emitido por IPC
      const registeredCallback = mockIpc.listeners.get('nfc:on-tag-detected')?.[0];
      registeredCallback?.({}, '04A1B2C3D4E5F6');
      assert.strictEqual(receivedUid, '04A1B2C3D4E5F6');

      // Limpieza con desuscripción
      unsubscribe();
      assert.strictEqual(mockIpc.listeners.get('nfc:on-tag-detected')?.length, 0);
    });

    it('debe implementar onHardwareStatusChange suscribiéndose y permitiendo desuscripción limpia', () => {
      const api = createElectronApi(mockIpc as any);
      let receivedStatus: HardwareStatus | null = null;
      const unsubscribe = api.onHardwareStatusChange?.((status: HardwareStatus) => {
        receivedStatus = status;
      });

      assert.ok(unsubscribe);
      assert.strictEqual(mockIpc.listeners.get('hardware:status-change')?.length, 1);

      const statusPayload: HardwareStatus = {
        connected: false,
        portName: 'COM3',
        reconnecting: true,
        attemptCount: 2,
      };

      const registeredCallback = mockIpc.listeners.get('hardware:status-change')?.[0];
      registeredCallback?.({}, statusPayload);
      assert.deepStrictEqual(receivedStatus, statusPayload);

      unsubscribe();
      assert.strictEqual(mockIpc.listeners.get('hardware:status-change')?.length, 0);
    });

    it('debe implementar getHardwareStatus invocando el canal hardware:get-status', async () => {
      const api = createElectronApi(mockIpc as any);
      const status = await api.getHardwareStatus?.();

      assert.deepStrictEqual(status, {
        connected: true,
        portName: 'COM3',
        reconnecting: false,
        attemptCount: 0,
      });
      assert.strictEqual(mockIpc.invocations[0]?.channel, 'hardware:get-status');
    });

    it('debe implementar simulateTagScan invocando el canal nfc:simulate-tag', async () => {
      const api = createElectronApi(mockIpc as any);
      await api.simulateTagScan?.('04112233445566');

      assert.strictEqual(mockIpc.invocations[0]?.channel, 'nfc:simulate-tag');
      assert.deepStrictEqual(mockIpc.invocations[0]?.args, ['04112233445566']);
    });

    it('debe implementar getAppInfo invocando el canal system:get-app-info', async () => {
      const api = createElectronApi(mockIpc as any);
      const info = await api.getAppInfo?.();

      assert.deepStrictEqual(info, { version: '0.1.0', platform: 'win32', arch: 'x64' });
      assert.strictEqual(mockIpc.invocations[0]?.channel, 'system:get-app-info');
    });
  });

  describe('Despacho Seguro de Eventos desde SerialManager hacia MainWindow (RF-27, RF-34)', () => {
    let serialManager: SerialManager;
    let mockWindow: {
      destroyed: boolean;
      isDestroyed: () => boolean;
      webContents: {
        sent: Array<{ channel: string; args: unknown[] }>;
        send: (channel: string, ...args: unknown[]) => void;
      };
    };

    beforeEach(() => {
      serialManager = new SerialManager({ driver: new InMemorySerialDriver() });
      mockWindow = {
        destroyed: false,
        isDestroyed() {
          return this.destroyed;
        },
        webContents: {
          sent: [],
          send(channel: string, ...args: unknown[]) {
            this.sent.push({ channel, args });
          },
        },
      };
    });

    afterEach(() => {
      serialManager.disconnect();
    });

    it('debe canalizar eventos de onTag hacia webContents.send cuando la ventana está activa (RF-27)', () => {
      const cleanup = setupSerialEvents(serialManager, () => mockWindow as any);

      // Emite UID a través de SerialManager
      serialManager.processIncomingData('UID:04A1B2C3\r\n');

      assert.strictEqual(mockWindow.webContents.sent.length, 1);
      assert.strictEqual(mockWindow.webContents.sent[0]?.channel, 'nfc:on-tag-detected');
      assert.strictEqual(mockWindow.webContents.sent[0]?.args[0], '04A1B2C3');

      cleanup();
    });

    it('debe canalizar eventos de onStatus hacia webContents.send cuando el estado cambia (RF-34)', async () => {
      const cleanup = setupSerialEvents(serialManager, () => mockWindow as any);

      // Provoca un cambio de estado en SerialManager conectando
      await serialManager.connect('COM4');

      const statusEvents = mockWindow.webContents.sent.filter(
        (e) => e.channel === 'hardware:status-change',
      );
      assert.ok(statusEvents.length > 0);
      const lastStatus = statusEvents[statusEvents.length - 1]?.args[0] as HardwareStatus;
      assert.strictEqual(lastStatus.connected, true);
      assert.strictEqual(lastStatus.portName, 'COM4');

      cleanup();
    });

    it('no debe intentar enviar eventos si la ventana es nula', () => {
      const cleanup = setupSerialEvents(serialManager, () => null);

      assert.doesNotThrow(() => {
        serialManager.processIncomingData('UID:04A1B2C3\r\n');
      });
      assert.strictEqual(mockWindow.webContents.sent.length, 0);

      cleanup();
    });

    it('no debe intentar enviar eventos si la ventana ha sido destruida (isDestroyed === true)', () => {
      mockWindow.destroyed = true;
      const cleanup = setupSerialEvents(serialManager, () => mockWindow as any);

      assert.doesNotThrow(() => {
        serialManager.processIncomingData('UID:04A1B2C3\r\n');
      });
      assert.strictEqual(mockWindow.webContents.sent.length, 0);

      cleanup();
    });

    it('debe desuscribir correctamente los listeners al invocar cleanup', () => {
      const cleanup = setupSerialEvents(serialManager, () => mockWindow as any);

      cleanup();

      serialManager.processIncomingData('UID:04A1B2C3\r\n');
      assert.strictEqual(mockWindow.webContents.sent.length, 0);
    });
  });

  describe('Registro de Canales IPC en Proceso Principal (RF-27, RF-34)', () => {
    let serialManager: SerialManager;
    let mockIpcMain: {
      handlers: Map<string, Function>;
      handle: (channel: string, handler: Function) => void;
    };
    let mockApp: {
      getVersion: () => string;
    };

    beforeEach(() => {
      serialManager = new SerialManager({ driver: new InMemorySerialDriver() });
      mockIpcMain = {
        handlers: new Map(),
        handle(channel: string, handler: Function) {
          this.handlers.set(channel, handler);
        },
      };
      mockApp = {
        getVersion: () => '0.1.0',
      };
    });

    afterEach(() => {
      serialManager.disconnect();
    });

    it('debe registrar los canales IPC hardware:get-status, nfc:simulate-tag y system:get-app-info', () => {
      registerIpcHandlers(serialManager, mockIpcMain as any, mockApp as any);

      assert.ok(mockIpcMain.handlers.has('hardware:get-status'));
      assert.ok(mockIpcMain.handlers.has('nfc:simulate-tag'));
      assert.ok(mockIpcMain.handlers.has('system:get-app-info'));
    });

    it('el handler hardware:get-status debe retornar el estado actual de SerialManager', async () => {
      registerIpcHandlers(serialManager, mockIpcMain as any, mockApp as any);
      const handler = mockIpcMain.handlers.get('hardware:get-status');
      assert.ok(handler);

      const status = await handler({});
      assert.deepStrictEqual(status, serialManager.getStatus());
    });

    it('el handler nfc:simulate-tag debe procesar la trama UID y delegar a serialManager', async () => {
      registerIpcHandlers(serialManager, mockIpcMain as any, mockApp as any);
      const handler = mockIpcMain.handlers.get('nfc:simulate-tag');
      assert.ok(handler);

      let detectedUid = '';
      serialManager.onTag((uid) => {
        detectedUid = uid;
      });

      const result = await handler({}, '04A1B2C3');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.emittedUid, '04A1B2C3');
      assert.strictEqual(detectedUid, '04A1B2C3');
    });

    it('el handler system:get-app-info debe retornar versión, plataforma y arquitectura sin secretos', async () => {
      registerIpcHandlers(serialManager, mockIpcMain as any, mockApp as any);
      const handler = mockIpcMain.handlers.get('system:get-app-info');
      assert.ok(handler);

      const info = await handler({});
      assert.strictEqual(info.version, '0.1.0');
      assert.strictEqual(typeof info.platform, 'string');
      assert.strictEqual(typeof info.arch, 'string');
      assert.strictEqual(typeof (info as any).databaseUrl, 'undefined');
      assert.strictEqual(typeof (info as any).jwtSecret, 'undefined');
    });
  });

  describe('Auditoría Estática de Ausencia de Secretos en Artefactos Desktop (RNF-2)', () => {
    it('no debe contener secretos de BD, JWT o claves privadas en código de Electron ni Renderer', () => {
      const desktopDir = path.resolve(
        process.cwd(),
        process.cwd().endsWith('desktop') ? '.' : 'apps/desktop',
      );
      const dirsToScan = [
        path.join(desktopDir, 'electron'),
        path.join(desktopDir, 'src'),
      ];

      const sensitivePatterns = [
        /postgresql:\/\//i,
        /mysql:\/\//i,
        /BEGIN PRIVATE KEY/i,
        /BEGIN RSA PRIVATE KEY/i,
        /JWT_SECRET\s*=\s*['"][^'"]+['"]/i,
        /SECRET_KEY\s*=\s*['"][^'"]+['"]/i,
        /admin_secret/i,
      ];

      for (const dir of dirsToScan) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const pattern of sensitivePatterns) {
              const match = content.match(pattern);
              assert.strictEqual(
                match,
                null,
                `Patrón sensible detectado en archivo ${fullPath}: ${match?.[0]} (RNF-2)`,
              );
            }
          }
        }
      }
    });
  });
});
