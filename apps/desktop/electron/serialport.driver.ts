import { SerialPort, ReadlineParser } from 'serialport';
import type { SerialPortInfo } from '@vet-app/shared-types';
import type { SerialDriver } from './serial.manager.ts';

export interface RawPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
  friendlyName?: string;
}

export interface SerialPortDriverOptions {
  baudRate?: number;
  serialPortClass?: unknown;
}

/**
 * Patrones VID/PID estándar de transceptores USB-Serial utilizados en ESP32 (RF-66).
 * CP210x: 10C4:EA60
 * CH340: 1A86:7523
 */
export const ESP32_VID_PID_PATTERNS = [
  { vendorId: '10C4', productId: 'EA60', description: 'Silicon Labs CP210x (ESP32)' },
  { vendorId: '1A86', productId: '7523', description: 'WCH CH340 (ESP32)' },
];

/**
 * Expresión regular obligatoria de sanitización de tramas seriales NFC (RF-27 / RF-66).
 * 8 a 14 caracteres hexadecimales en mayúsculas tras el prefijo UID:.
 */
export const SERIAL_LINE_REGEX = /^UID:([0-9A-F]{8}|[0-9A-F]{14})$/;

/**
 * Driver de comunicación por puerto serial real para el proceso principal de Electron (RF-66).
 * Lee a 115200 baudios 8N1, filtra tramas con ReadlineParser (\r\n) y descarta logs de bootloader de ESP32.
 */
export class SerialPortDriver implements SerialDriver {
  public isOpen = false;
  private portInstance: {
    isOpen?: boolean;
    open: (cb: (err: Error | null) => void) => void;
    close: (cb: (err: Error | null) => void) => void;
    pipe: (dest: unknown) => unknown;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  } | null = null;
  private parserInstance: {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  } | null = null;

  private dataCallback?: (chunk: string | Buffer) => void;
  private errorCallback?: (error: Error) => void;
  private closeCallback?: () => void;
  private lastError: string | null = null;
  private readonly baudRate: number;
  private readonly SerialPortImpl: typeof SerialPort;

  constructor(options: SerialPortDriverOptions = {}) {
    this.baudRate = options.baudRate ?? 115200;
    this.SerialPortImpl = (options.serialPortClass as typeof SerialPort) ?? SerialPort;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public async open(portName: string, baudRate?: number): Promise<boolean> {
    this.lastError = null;
    const targetBaud = baudRate ?? this.baudRate;

    if (this.isOpen && this.portInstance) {
      await this.close();
    }

    return new Promise<boolean>((resolve) => {
      try {
        const port = new (this.SerialPortImpl as unknown as new (opts: unknown) => typeof this.portInstance)({
          path: portName,
          baudRate: targetBaud,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false,
        });

        this.portInstance = port;

        const handleOpenError = (err: unknown) => {
          this.isOpen = false;
          const msg = (err as Error)?.message || String(err);
          const code = (err as { code?: string })?.code;
          if (
            code === 'EACCES' ||
            code === 'EBUSY' ||
            msg.includes('Access is denied') ||
            msg.includes('busy') ||
            msg.includes('in use')
          ) {
            this.lastError = `El puerto serial ${portName} está ocupado o en uso por otra aplicación (ej. Thonny o monitor serial). Cierre la otra aplicación e intente de nuevo.`;
          } else {
            this.lastError = `No se pudo abrir el puerto serial ${portName}: ${msg}`;
          }
          resolve(false);
        };

        if (!port) {
          handleOpenError(new Error('No se pudo inicializar la instancia del puerto serial'));
          return;
        }

        port.open((err: Error | null) => {
          if (err) {
            handleOpenError(err);
            return;
          }

          this.isOpen = true;
          const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' })) as {
            on: (event: string, cb: (...args: unknown[]) => void) => void;
          };
          this.parserInstance = parser;

          parser.on('data', (rawLine: unknown) => {
            const line = String(rawLine).trim();
            // Filtrado estricto: solo líneas que cumplan ^UID:([0-9A-F]{8}|[0-9A-F]{14})$
            // Se descartan silenciosamente líneas de arranque de ESP32 o ruido
            if (SERIAL_LINE_REGEX.test(line)) {
              this.dataCallback?.(`${line}\r\n`);
            }
          });

          port.on('close', () => {
            this.isOpen = false;
            this.closeCallback?.();
          });

          port.on('error', (err: unknown) => {
            this.isOpen = false;
            this.errorCallback?.(err as Error);
          });

          resolve(true);
        });
      } catch (err: unknown) {
        this.isOpen = false;
        const msg = (err as Error)?.message || String(err);
        this.lastError = `Error inesperado al inicializar el puerto serial: ${msg}`;
        resolve(false);
      }
    });
  }

  public async close(): Promise<void> {
    if (!this.portInstance) {
      this.isOpen = false;
      return;
    }

    return new Promise<void>((resolve) => {
      const port = this.portInstance;
      if (!port || !port.isOpen) {
        this.isOpen = false;
        this.portInstance = null;
        resolve();
        return;
      }

      port.close(() => {
        this.isOpen = false;
        this.portInstance = null;
        resolve();
      });
    });
  }

  public onData(callback: (chunk: string | Buffer) => void): void {
    this.dataCallback = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  /**
   * Determina si un puerto reportado corresponde a un chip ESP32 (CP210x o CH340).
   */
  public static isEsp32Device(port: {
    vendorId?: string;
    productId?: string;
    pnpId?: string;
    friendlyName?: string;
    manufacturer?: string;
  }): boolean {
    const vid = port.vendorId?.toUpperCase().replace(/^0X/, '');
    const pid = port.productId?.toUpperCase().replace(/^0X/, '');
    if (vid && pid) {
      const matched = ESP32_VID_PID_PATTERNS.some(
        (pattern) => pattern.vendorId === vid && pattern.productId === pid
      );
      if (matched) return true;
    }

    if (port.pnpId) {
      const upperPnp = port.pnpId.toUpperCase();
      if (upperPnp.includes('VID_10C4') && upperPnp.includes('PID_EA60')) return true;
      if (upperPnp.includes('VID_1A86') && upperPnp.includes('PID_7523')) return true;
    }

    return false;
  }

  /**
   * Enumera los puertos seriales disponibles clasificando adaptadores ESP32 (RF-67).
   */
  public static async listAvailablePorts(
    listFn?: () => Promise<RawPortInfo[]>
  ): Promise<SerialPortInfo[]> {
    try {
      const ports: RawPortInfo[] = listFn
        ? await listFn()
        : ((await SerialPort.list()) as RawPortInfo[]);

      return ports.map((p) => {
        const isEsp = SerialPortDriver.isEsp32Device(p);
        const nameParts: string[] = [p.path];
        if (p.friendlyName) {
          nameParts.push(p.friendlyName);
        } else if (p.manufacturer) {
          nameParts.push(p.manufacturer);
        }
        if (isEsp) {
          nameParts.push('(ESP32)');
        }
        return {
          path: p.path,
          manufacturer: p.manufacturer,
          vendorId: p.vendorId,
          productId: p.productId,
          isEsp32: isEsp,
          displayName: nameParts.join(' - '),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Autodetecta el puerto de un transceptor ESP32 priorizando la variable SERIAL_PORT (RF-66).
   */
  public static async detectEsp32Port(
    listFn?: () => Promise<RawPortInfo[]>
  ): Promise<string | null> {
    if (process.env.SERIAL_PORT) {
      return process.env.SERIAL_PORT;
    }

    try {
      const ports: RawPortInfo[] = listFn
        ? await listFn()
        : ((await SerialPort.list()) as RawPortInfo[]);

      const espPort = ports.find((p) => SerialPortDriver.isEsp32Device(p));
      return espPort?.path ?? null;
    } catch {
      return null;
    }
  }
}
