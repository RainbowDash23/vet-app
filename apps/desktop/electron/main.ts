import * as path from 'path';
import electron from 'electron';
import type { BrowserWindow as BrowserWindowInstance, BrowserWindowConstructorOptions, IpcMain, App } from 'electron';
import { SerialManager } from './serial.manager.ts';
import { APP_SCHEME_PRIVILEGES, registerAppProtocol } from './custom-protocol.ts';
import { UpdaterManager } from './updater.manager.ts';
import type { IAutoUpdater } from './updater.manager.ts';
import type { HardwareStatus } from '@vet-app/shared-types';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.resolve('electron');

const electronModule =
  (electron as unknown as { default?: typeof import('electron') })?.default ??
  (electron as unknown as typeof import('electron'));

const app = electronModule?.app;
const BrowserWindow = electronModule?.BrowserWindow;
const ipcMain = electronModule?.ipcMain;
const protocol = electronModule?.protocol;

function resolveAutoUpdater(): IAutoUpdater | null {
  try {
    if (!app || typeof app.whenReady !== 'function') {
      return null;
    }
    const updaterMod = require('electron-updater');
    return (updaterMod?.autoUpdater ?? updaterMod?.default?.autoUpdater ?? null) as IAutoUpdater | null;
  } catch {
    return null;
  }
}

// Registro de esquemas con privilegios antes de que app esté lista (Requisito estricto de Electron)
if (protocol && typeof protocol.registerSchemesAsPrivileged === 'function') {
  protocol.registerSchemesAsPrivileged([APP_SCHEME_PRIVILEGES]);
}

/**
 * Configuración estricta de seguridad y dimensiones de la ventana principal (RNF-6).
 */
export const DEFAULT_WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  title: 'VetApp Desktop',
  backgroundColor: '#0f172a',
  webPreferences: {
    preload: path.join(currentDir, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  },
};

/**
 * Configuración de la ventana de carga / splash tipo Discord para actualizaciones.
 */
export const DEFAULT_SPLASH_OPTIONS: BrowserWindowConstructorOptions = {
  width: 420,
  height: 480,
  resizable: false,
  frame: false,
  center: true,
  title: 'VetApp',
  backgroundColor: '#0c0e12',
  webPreferences: {
    preload: path.join(currentDir, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  },
};

let mainWindow: BrowserWindowInstance | null = null;
let splashWindow: BrowserWindowInstance | null = null;

export const serialManager = new SerialManager();
export const updaterManager = new UpdaterManager({
  updater: resolveAutoUpdater() ?? undefined,
  isPackaged: Boolean(app?.isPackaged),
  currentVersion: app?.getVersion ? app.getVersion() : '0.1.0',
});

export function getMainWindow(): BrowserWindowInstance | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindowInstance | null): void {
  mainWindow = win;
}

export function getSplashWindow(): BrowserWindowInstance | null {
  return splashWindow;
}

export function setSplashWindow(win: BrowserWindowInstance | null): void {
  splashWindow = win;
}

export function createWindow(customOptions?: BrowserWindowConstructorOptions): BrowserWindowInstance {
  const options: BrowserWindowConstructorOptions = {
    ...DEFAULT_WINDOW_OPTIONS,
    ...customOptions,
    webPreferences: {
      ...DEFAULT_WINDOW_OPTIONS.webPreferences,
      ...customOptions?.webPreferences,
    },
  };

  mainWindow = new BrowserWindow(options);

  const isDev = !app?.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Servicio seguro vía protocolo registrado app://vetapp sin usar file:// ni null (RNF-6)
    void mainWindow.loadURL('app://vetapp/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function createSplashWindow(customOptions?: BrowserWindowConstructorOptions): BrowserWindowInstance {
  const options: BrowserWindowConstructorOptions = {
    ...DEFAULT_SPLASH_OPTIONS,
    ...customOptions,
    webPreferences: {
      ...DEFAULT_SPLASH_OPTIONS.webPreferences,
      ...customOptions?.webPreferences,
    },
  };

  splashWindow = new BrowserWindow(options);
  const splashPath = path.join(currentDir, 'splash.html');
  void splashWindow.loadFile(splashPath);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

/**
 * Vincula los eventos del SerialManager con la ventana de Electron (RF-27, RF-34).
 * Solo emite a webContents.send si la ventana existe y no ha sido destruida.
 */
export function setupSerialEvents(
  manager: SerialManager,
  getWindow: () => BrowserWindowInstance | null,
): () => void {
  const unsubTag = manager.onTag((uid: string) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('nfc:on-tag-detected', uid);
    }
  });

  const unsubStatus = manager.onStatus((status: HardwareStatus) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('hardware:status-change', status);
    }
  });

  return () => {
    unsubTag();
    unsubStatus();
  };
}

/**
 * Registra los manejadores IPC en el proceso principal de Electron (RF-27, RF-34, RNF-2).
 */
export function registerIpcHandlers(
  manager: SerialManager = serialManager,
  ipc: IpcMain = ipcMain,
  appInstance: App = app,
  updater: UpdaterManager = updaterManager,
): void {
  if (!ipc) {
    return;
  }

  // Consulta de estado de hardware serial (RF-34)
  ipc.handle('hardware:get-status', () => {
    return manager.getStatus();
  });

  // Listado de puertos seriales disponibles (RF-67)
  ipc.handle('serial:list-ports', async () => {
    return await manager.listPorts();
  });

  // Conexión dinámica a puerto serial seleccionado (RF-67)
  ipc.handle('serial:connect', async (_event: unknown, portPath: string) => {
    const success = await manager.connect(portPath);
    return {
      success,
      portName: manager.getCurrentPort(),
      error: success ? undefined : manager.getLastError() ?? 'Error al conectar al puerto serial',
    };
  });

  // Verificación de autorización de simulación (desactivada en app empaquetada salvo variable explícita)
  const isSimulationAllowed = (): boolean => {
    if (!appInstance?.isPackaged) {
      return true;
    }
    return (
      process.env.VITE_DEV_TOOLS === 'true' ||
      process.env.ENABLE_SIMULATION === 'true' ||
      process.env.ELECTRON_ENABLE_SIMULATION === 'true'
    );
  };

  // Simulación de lectura de tag NFC delegando a SerialManager (RF-27)
  ipc.handle('nfc:simulate-tag', (_event: unknown, uid: string) => {
    if (!isSimulationAllowed()) {
      return {
        success: false,
        emittedUid: '',
        error: 'Simulación deshabilitada en la aplicación empaquetada',
      };
    }
    manager.processIncomingData(`UID:${uid}\r\n`);
    return { success: true, emittedUid: uid };
  });

  // Compatibilidad con canal previo de simulación
  ipc.handle('nfc:simulate-hardware-tag', (_event: unknown, uid: string) => {
    if (!isSimulationAllowed()) {
      return {
        success: false,
        emittedUid: '',
        error: 'Simulación deshabilitada en la aplicación empaquetada',
      };
    }
    manager.processIncomingData(`UID:${uid}\r\n`);
    return { success: true, emittedUid: uid };
  });

  // Información del sistema sin datos sensibles ni secretos de infraestructura (RNF-2)
  ipc.handle('system:get-app-info', () => {
    return {
      version: appInstance?.getVersion ? appInstance.getVersion() : '0.1.0',
      platform: process.platform,
      arch: process.arch,
    };
  });

  // Manejadores IPC para el gestor de auto-actualizaciones
  ipc.handle('updater:restart-and-install', () => {
    updater.restartAndInstall();
    return { success: true };
  });

  ipc.handle('updater:skip', () => {
    updater.skip();
    return { success: true };
  });

  ipc.handle('updater:get-status', () => {
    return updater.getStatusPayload();
  });
}

// Inicialización del ciclo de vida de Electron cuando se ejecuta dentro del runtime
if (app && typeof app.whenReady === 'function') {
  app.whenReady().then(() => {
    registerAppProtocol(protocol, path.join(currentDir, '../dist'));
    registerIpcHandlers(serialManager, ipcMain, app, updaterManager);

    const isPackaged = Boolean(app.isPackaged);

    const launchMainApp = () => {
      createWindow();
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      void serialManager.connect();
      setupSerialEvents(serialManager, () => mainWindow);
    };

    if (isPackaged) {
      const splash = createSplashWindow();
      updaterManager.start(
        () => {
          launchMainApp();
        },
        (payload) => {
          if (splash && !splash.isDestroyed()) {
            splash.webContents.send('updater:status-changed', payload);
          }
        },
      );
    } else {
      launchMainApp();
    }

    app.on('activate', () => {
      if (BrowserWindow && BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('will-quit', () => {
    serialManager.disconnect();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
