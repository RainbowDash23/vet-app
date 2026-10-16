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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
