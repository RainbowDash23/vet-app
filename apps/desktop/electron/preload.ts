import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  simulateHardwareTag: (uid: string) => Promise<{ success: boolean; emittedUid: string }>;
  onTagDetected: (callback: (uid: string) => void) => () => void;
}

// Exposición segura hacia el proceso Renderer mediante contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: (): Promise<AppInfo> => {
    return ipcRenderer.invoke('system:get-app-info');
  },

  simulateHardwareTag: (uid: string): Promise<{ success: boolean; emittedUid: string }> => {
    return ipcRenderer.invoke('nfc:simulate-hardware-tag', uid);
  },

  onTagDetected: (callback: (uid: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, uid: string) => callback(uid);
    ipcRenderer.on('nfc:on-tag-detected', subscription);

    // Retorna función de desuscripción para limpieza de listeners en React (useEffect cleanup)
    return () => {
      ipcRenderer.removeListener('nfc:on-tag-detected', subscription);
    };
  },
} satisfies ElectronAPI);
