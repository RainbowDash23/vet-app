import electron from 'electron';
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { ElectronAPI, HardwareStatus, SerialPortInfo, ConnectPortResult } from '@vet-app/shared-types';

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
}

export type { ElectronAPI, HardwareStatus, SerialPortInfo, ConnectPortResult };

const electronModule =
  (electron as unknown as { default?: typeof import('electron') })?.default ??
  (electron as unknown as typeof import('electron'));

const contextBridge = electronModule?.contextBridge;
const ipcRenderer = electronModule?.ipcRenderer;

/**
 * Fábrica de la API de Electron expuesta de forma segura al Renderer (RNF-6).
 * No expone ipcRenderer, require, process ni credenciales privadas (RNF-2).
 */
export function createElectronApi(ipc: IpcRenderer): ElectronAPI & {
  getAppInfo?: () => Promise<AppInfo>;
  simulateHardwareTag?: (uid: string) => Promise<{ success: boolean; emittedUid: string }>;
} {
  return {
    onTagDetected: (callback: (uid: string) => void): (() => void) => {
      const subscription = (_event: IpcRendererEvent, uid: string) => callback(uid);
      ipc.on('nfc:on-tag-detected', subscription);

      return () => {
        ipc.removeListener('nfc:on-tag-detected', subscription);
      };
    },

    onHardwareStatusChange: (callback: (status: HardwareStatus) => void): (() => void) => {
      const subscription = (_event: IpcRendererEvent, status: HardwareStatus) => callback(status);
      ipc.on('hardware:status-change', subscription);

      return () => {
        ipc.removeListener('hardware:status-change', subscription);
      };
    },

    getHardwareStatus: (): Promise<HardwareStatus> => {
      return ipc.invoke('hardware:get-status');
    },

    simulateTagScan: async (uid: string): Promise<void> => {
      await ipc.invoke('nfc:simulate-tag', uid);
    },

    simulateHardwareTag: (uid: string): Promise<{ success: boolean; emittedUid: string }> => {
      return ipc.invoke('nfc:simulate-tag', uid);
    },

    getAppInfo: (): Promise<AppInfo> => {
      return ipc.invoke('system:get-app-info');
    },

    listSerialPorts: (): Promise<SerialPortInfo[]> => {
      return ipc.invoke('serial:list-ports');
    },

    connectSerialPort: (portPath: string): Promise<ConnectPortResult> => {
      return ipc.invoke('serial:connect', portPath);
    },
  };
}

// Exposición segura hacia el proceso Renderer mediante contextBridge (RNF-6)
if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function' && ipcRenderer) {
  const electronApi = createElectronApi(ipcRenderer);
  contextBridge.exposeInMainWorld('electronAPI', electronApi);
}
