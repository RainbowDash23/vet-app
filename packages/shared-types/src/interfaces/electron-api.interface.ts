export interface HardwareStatus {
  connected: boolean;
  portName?: string | null;
  reconnecting?: boolean;
  attemptCount?: number;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  isEsp32: boolean;
  displayName: string;
}

export interface ConnectPortResult {
  success: boolean;
  portName?: string | null;
  error?: string;
}

export interface ElectronAPI {
  onTagDetected: (callback: (uid: string) => void) => () => void;
  onHardwareStatusChange?: (callback: (status: HardwareStatus) => void) => () => void;
  getHardwareStatus?: () => Promise<HardwareStatus>;
  simulateTagScan?: (uid: string) => Promise<void>;
  simulateHardwareTag?: (uid: string) => Promise<{ success: boolean; emittedUid: string }>;
  getAppInfo?: () => Promise<{ version: string; platform: string; arch: string }>;
  listSerialPorts?: () => Promise<SerialPortInfo[]>;
  connectSerialPort?: (portPath: string) => Promise<ConnectPortResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
