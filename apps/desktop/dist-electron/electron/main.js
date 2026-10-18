"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serialManager = exports.DEFAULT_WINDOW_OPTIONS = void 0;
exports.getMainWindow = getMainWindow;
exports.setMainWindow = setMainWindow;
exports.createWindow = createWindow;
exports.setupSerialEvents = setupSerialEvents;
exports.registerIpcHandlers = registerIpcHandlers;
const path = __importStar(require("path"));
const electron_1 = __importDefault(require("electron"));
const serial_manager_ts_1 = require("./serial.manager.js");
const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.resolve('electron');
const electronModule = electron_1.default?.default ??
    electron_1.default;
const app = electronModule?.app;
const BrowserWindow = electronModule?.BrowserWindow;
const ipcMain = electronModule?.ipcMain;
/**
 * Configuración estricta de seguridad y dimensiones de la ventana principal (RNF-6).
 */
exports.DEFAULT_WINDOW_OPTIONS = {
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
let mainWindow = null;
exports.serialManager = new serial_manager_ts_1.SerialManager();
function getMainWindow() {
    return mainWindow;
}
function setMainWindow(win) {
    mainWindow = win;
}
function createWindow(customOptions) {
    const options = {
        ...exports.DEFAULT_WINDOW_OPTIONS,
        ...customOptions,
        webPreferences: {
            ...exports.DEFAULT_WINDOW_OPTIONS.webPreferences,
            ...customOptions?.webPreferences,
        },
    };
    mainWindow = new BrowserWindow(options);
    const isDev = !app?.isPackaged && process.env.NODE_ENV !== 'production';
    if (isDev) {
        void mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
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
function setupSerialEvents(manager, getWindow) {
    const unsubTag = manager.onTag((uid) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('nfc:on-tag-detected', uid);
        }
    });
    const unsubStatus = manager.onStatus((status) => {
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
function registerIpcHandlers(manager = exports.serialManager, ipc = ipcMain, appInstance = app) {
    if (!ipc) {
        return;
    }
    // Consulta de estado de hardware serial (RF-34)
    ipc.handle('hardware:get-status', () => {
        return manager.getStatus();
    });
    // Simulación de lectura de tag NFC delegando a SerialManager (RF-27)
    ipc.handle('nfc:simulate-tag', (_event, uid) => {
        manager.processIncomingData(`UID:${uid}\r\n`);
        return { success: true, emittedUid: uid };
    });
    // Compatibilidad con canal previo de simulación
    ipc.handle('nfc:simulate-hardware-tag', (_event, uid) => {
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
        registerIpcHandlers(exports.serialManager, ipcMain, app);
        createWindow();
        // Inicia enlace serial y escucha eventos hacia MainWindow
        void exports.serialManager.connect();
        setupSerialEvents(exports.serialManager, () => mainWindow);
        app.on('activate', () => {
            if (BrowserWindow && BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
    app.on('will-quit', () => {
        exports.serialManager.disconnect();
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
//# sourceMappingURL=main.js.map