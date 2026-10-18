import * as path from 'path';
import electron from 'electron';
import type { BrowserWindow as BrowserWindowInstance, BrowserWindowConstructorOptions, IpcMain, App } from 'electron';
import { SerialManager } from './serial.manager.ts';
import type { HardwareStatus } from '@vet-app/shared-types';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.resolve('electron');

const electronModule =
  (electron as unknown as { default?: typeof import('electron') })?.default ??
  (electron as unknown as typeof import('electron'));

const app = electronModule?.app;
const BrowserWindow = electronModule?.BrowserWindow;
const ipcMain = electronModule?.ipcMain;

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

let mainWindow: BrowserWindowInstance | null = null;
export const serialManager = new SerialManager();

export function getMainWindow(): BrowserWindowInstance | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindowInstance | null): void {
  mainWindow = win;
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
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
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
): void {
  if (!ipc) {
    return;
  }

  // Consulta de estado de hardware serial (RF-34)
  ipc.handle('hardware:get-status', () => {
    return manager.getStatus();
  });

  // Simulación de lectura de tag NFC delegando a SerialManager (RF-27)
  ipc.handle('nfc:simulate-tag', (_event: unknown, uid: string) => {
    manager.processIncomingData(`UID:${uid}\r\n`);
    return { success: true, emittedUid: uid };
  });

  // Compatibilidad con canal previo de simulación
  ipc.handle('nfc:simulate-hardware-tag', (_event: unknown, uid: string) => {
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
}

// Inicialización del ciclo de vida de Electron cuando se ejecuta dentro del runtime
if (app && typeof app.whenReady === 'function') {
  app.whenReady().then(() => {
    registerIpcHandlers(serialManager, ipcMain, app);
    createWindow();

    // Inicia enlace serial y escucha eventos hacia MainWindow
    void serialManager.connect();
    setupSerialEvents(serialManager, () => mainWindow);

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
