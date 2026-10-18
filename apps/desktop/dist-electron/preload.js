"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createElectronApi = createElectronApi;
const electron_1 = __importDefault(require("electron"));
const electronModule = electron_1.default?.default ??
    electron_1.default;
const contextBridge = electronModule?.contextBridge;
const ipcRenderer = electronModule?.ipcRenderer;
/**
 * Fábrica de la API de Electron expuesta de forma segura al Renderer (RNF-6).
 * No expone ipcRenderer, require, process ni credenciales privadas (RNF-2).
 */
function createElectronApi(ipc) {
    return {
        onTagDetected: (callback) => {
            const subscription = (_event, uid) => callback(uid);
            ipc.on('nfc:on-tag-detected', subscription);
            return () => {
                ipc.removeListener('nfc:on-tag-detected', subscription);
            };
        },
        onHardwareStatusChange: (callback) => {
            const subscription = (_event, status) => callback(status);
            ipc.on('hardware:status-change', subscription);
            return () => {
                ipc.removeListener('hardware:status-change', subscription);
            };
        },
        getHardwareStatus: () => {
            return ipc.invoke('hardware:get-status');
        },
        simulateTagScan: async (uid) => {
            await ipc.invoke('nfc:simulate-tag', uid);
        },
        simulateHardwareTag: (uid) => {
            return ipc.invoke('nfc:simulate-tag', uid);
        },
        getAppInfo: () => {
            return ipc.invoke('system:get-app-info');
        },
    };
}
// Exposición segura hacia el proceso Renderer mediante contextBridge (RNF-6)
if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function' && ipcRenderer) {
    const electronApi = createElectronApi(ipcRenderer);
    contextBridge.exposeInMainWorld('electronAPI', electronApi);
}
//# sourceMappingURL=preload.js.map