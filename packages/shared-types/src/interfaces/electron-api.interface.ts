export interface HardwareStatus {
  connected: boolean;
  portName?: string | null;
  reconnecting?: boolean;
  attemptCount?: number;
}

export interface ElectronAPI {
  onTagDetected: (callback: (uid: string) => void) => () => void;
  onHardwareStatusChange?: (callback: (status: HardwareStatus) => void) => () => void;
  getHardwareStatus?: () => Promise<HardwareStatus>;
  simulateTagScan?: (uid: string) => Promise<void>;
  simulateHardwareTag?: (uid: string) => Promise<{ success: boolean; emittedUid: string }>;
  getAppInfo?: () => Promise<{ version: string; platform: string; arch: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
