import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'VetApp Desktop',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Registro de canales IPC seguros en el proceso principal
function registerIpcHandlers(): void {
  // Manejo de petición-respuesta (invoke / handle)
  ipcMain.handle('system:get-app-info', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    };
  });

  // Simulación de evento de hardware NFC recibido en el Main Process hacia el Renderer
  ipcMain.handle('nfc:simulate-hardware-tag', (_event, uid: string) => {
    console.log(`[IPC Main] Evento de hardware NFC simulado para UID: ${uid}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nfc:on-tag-detected', uid);
    }
    return { success: true, emittedUid: uid };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
