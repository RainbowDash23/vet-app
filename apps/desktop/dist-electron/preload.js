"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Exposición segura hacia el proceso Renderer mediante contextBridge
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getAppInfo: () => {
        return electron_1.ipcRenderer.invoke('system:get-app-info');
    },
    simulateHardwareTag: (uid) => {
        return electron_1.ipcRenderer.invoke('nfc:simulate-hardware-tag', uid);
    },
    onTagDetected: (callback) => {
        const subscription = (_event, uid) => callback(uid);
        electron_1.ipcRenderer.on('nfc:on-tag-detected', subscription);
        // Retorna función de desuscripción para limpieza de listeners en React (useEffect cleanup)
        return () => {
            electron_1.ipcRenderer.removeListener('nfc:on-tag-detected', subscription);
        };
    },
});
//# sourceMappingURL=preload.js.map