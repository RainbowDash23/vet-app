import type { ElectronAPI } from '@vet-app/shared-types';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
