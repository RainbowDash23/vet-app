import { EventEmitter } from 'events';
import type { HardwareStatus, SerialPortInfo } from '@vet-app/shared-types';
import type { ITagReader } from '../src/readers/tag-reader.interface';
import { SerialPortDriver } from './serialport.driver.ts';

/**
 * Expresión regular obligatoria de sanitización de tramas seriales NFC (RF-27).
 * Valida tramas con prefijo UID: y entre 8 y 14 caracteres hexadecimales.
 */
export const SERIAL_FRAME_REGEX = /^UID:([0-9A-Fa-f]{8,14})$/;

/**
 * Intervalo de reconexión periódica en milisegundos (RF-34: 3000 ms).
 */
export const RECONNECT_INTERVAL_MS = 3000;

/**
 * Límite máximo de intentos de reconexión automática (RF-34: 10 intentos).
 */
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Tasa de baudios por defecto (RF-26: 115200 baudios, 8N1).
 */
export const DEFAULT_BAUD_RATE = 115200;

/**
 * Interfaz para abstracción del driver o mock de puerto serial.
 * Permite pruebas automatizadas 100% deterministas en memoria sin exigir hardware físico (RNF-4, RNF-5).
 */
export interface SerialDriver {
  isOpen: boolean;
  open(portName: string, baudRate: number): Promise<boolean>;
  close(): Promise<void>;
  onData?: (callback: (chunk: string | Buffer) => void) => void;
  onError?: (callback: (error: Error) => void) => void;
  onClose?: (callback: () => void) => void;
}

/**
 * Implementación básica en memoria para entornos sin hardware real.
 */
export class InMemorySerialDriver implements SerialDriver {
  public isOpen = false;
  private dataCallback?: (chunk: string | Buffer) => void;
  private closeCallback?: () => void;
  private errorCallback?: (error: Error) => void;

  public async open(_portName: string, _baudRate: number): Promise<boolean> {
    this.isOpen = true;
    return true;
  }

  public async close(): Promise<void> {
    this.isOpen = false;
  }

  public onData(callback: (chunk: string | Buffer) => void): void {
    this.dataCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  public emitData(chunk: string | Buffer): void {
    this.dataCallback?.(chunk);
  }

  public emitClose(): void {
    this.isOpen = false;
    this.closeCallback?.();
  }

  public emitError(error: Error): void {
    this.isOpen = false;
    this.errorCallback?.(error);
  }
}

export interface SerialManagerOptions {
  driver?: SerialDriver;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  baudRate?: number;
  defaultPort?: string;
}

/**
 * Gestor del enlace serial USB para el lector NFC (RF-27, RF-34).
 * Maneja el búfer de tramas entrantes, la sanitización sintáctica y la máquina de estados de reconexión.
 * Implementa ITagReader para compatibilidad con simuladores y abstracciones de hardware.
 */
export class SerialManager extends EventEmitter implements ITagReader {
  private readonly driver: SerialDriver;
  private readonly reconnectIntervalMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly baudRate: number;

  private currentPort: string | null = null;
  private buffer = '';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;

  private status: HardwareStatus = {
    connected: false,
    portName: null,
    reconnecting: false,
    attemptCount: 0,
  };

  constructor(options: SerialManagerOptions = {}) {
    super();
    this.driver =
      options.driver ??
      (process.env.SERIAL_DRIVER === 'memory'
        ? new InMemorySerialDriver()
        : new SerialPortDriver({ baudRate: options.baudRate }));
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? RECONNECT_INTERVAL_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
    this.baudRate = options.baudRate ?? DEFAULT_BAUD_RATE;
    this.currentPort = options.defaultPort ?? null;

    this.setupDriverListeners();
  }

  /**
   * Configura los listeners del driver de puerto serial.
   */
  private setupDriverListeners(): void {
    this.driver.onData?.((chunk: string | Buffer) => {
      this.processIncomingData(chunk);
    });

    this.driver.onClose?.(() => {
      this.handleUnexpectedDisconnection();
    });

    this.driver.onError?.((_err: Error) => {
      this.handleUnexpectedDisconnection();
    });
  }

  /**
   * Retorna el último mensaje de error registrado por el driver.
   */
  public getLastError(): string | null {
    if ('getLastError' in this.driver && typeof (this.driver as unknown as { getLastError: () => string | null }).getLastError === 'function') {
      return (this.driver as unknown as { getLastError: () => string | null }).getLastError();
    }
    return null;
  }

  /**
   * Retorna el puerto serial actualmente configurado.
   */
  public getCurrentPort(): string | null {
    return this.currentPort;
  }

  /**
   * Enumera los puertos seriales detectados en el sistema (RF-67).
   */
  public async listPorts(): Promise<SerialPortInfo[]> {
    return SerialPortDriver.listAvailablePorts();
  }

  /**
   * Conecta al puerto serial especificado o al puerto predeterminado.
   */
  public async connect(portName?: string): Promise<boolean> {
    this.clearReconnectTimer();
    this.isManualDisconnect = false;

    let targetPort = portName || this.currentPort;
    if (!targetPort) {
      targetPort = (await SerialPortDriver.detectEsp32Port()) || 'COM3';
    }
    this.currentPort = targetPort;

    try {
      const opened = await this.driver.open(targetPort, this.baudRate);
      if (!opened) {
        return false;
      }

      this.updateStatus({
        connected: true,
        portName: targetPort,
        reconnecting: false,
        attemptCount: 0,
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Desconecta intencionalmente el puerto serial y cancela cualquier ciclo de reconexión.
   */
  public disconnect(): void {
    this.isManualDisconnect = true;
    this.clearReconnectTimer();

    void this.driver.close().catch(() => {});

    this.updateStatus({
      connected: false,
      portName: null,
      reconnecting: false,
      attemptCount: 0,
    });
  }

  /**
   * Maneja desconexiones no intencionales del enlace serial (RF-34).
   */
  private handleUnexpectedDisconnection(): void {
    if (this.isManualDisconnect) {
      return;
    }

    if (this.status.reconnecting) {
      return;
    }

    // Inicia máquina de estados de reconexión: intento 1
    this.updateStatus({
      connected: false,
      portName: this.currentPort,
      reconnecting: true,
      attemptCount: 1,
    });

    this.scheduleNextReconnect();
  }

  /**
   * Programa el próximo ciclo de reconexión tras el intervalo especificado.
   */
  private scheduleNextReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, this.reconnectIntervalMs);
  }

  /**
   * Ejecuta un intento de reconexión automática (RF-34).
   */
  private async attemptReconnect(): Promise<void> {
    if (this.isManualDisconnect) {
      return;
    }

    const targetPort = this.currentPort || 'COM3';

    try {
      const opened = await this.driver.open(targetPort, this.baudRate);

      if (opened) {
        // Reconexión exitosa: restablece métricas
        this.clearReconnectTimer();
        this.updateStatus({
          connected: true,
          portName: targetPort,
          reconnecting: false,
          attemptCount: 0,
        });
        return;
      }
    } catch {
      // Ignora error puntual de apertura y continúa el ciclo
    }

    // Reintento fallido: incrementa contador de intentos
    const currentAttempt = this.status.attemptCount ?? 1;
    const nextAttempt = currentAttempt + 1;

    if (nextAttempt >= this.maxReconnectAttempts) {
      // Alcanzó el límite máximo: detiene la reconexión automática y solicita intervención (RF-34)
      this.clearReconnectTimer();
      this.updateStatus({
        connected: false,
        portName: targetPort,
        reconnecting: false,
        attemptCount: this.maxReconnectAttempts,
      });
      return;
    }

    // Aún dentro del margen: actualiza intento y programa siguiente
    this.updateStatus({
      connected: false,
      portName: targetPort,
      reconnecting: true,
      attemptCount: nextAttempt,
    });

    this.scheduleNextReconnect();
  }

  /**
   * Cancela cualquier temporizador de reconexión pendiente.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Actualiza el estado interno de hardware y emite el evento 'status'.
   */
  private updateStatus(newStatus: HardwareStatus): void {
    this.status = { ...newStatus };
    this.emit('status', this.getStatus());
  }

  /**
   * Procesa fragmentos de datos entrantes desde el puerto serial,
   * manteniendo un búfer para tramas fragmentadas y sanitizando contra ruido (RF-27).
   */
  public processIncomingData(chunk: string | Buffer): void {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    this.buffer += text;

    // Protección contra acumulación excesiva de ruido sin delimitador
    if (this.buffer.length > 4096) {
      this.buffer = this.buffer.slice(-1024);
    }

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      // Limpia retorno de carro y espacios en los extremos
      const line = rawLine.replace(/\r$/, '').trim();
      if (!line) {
        continue;
      }

      // Validación sintáctica estricta con SERIAL_FRAME_REGEX (RF-27)
      const match = line.match(SERIAL_FRAME_REGEX);
      if (match && match[1]) {
        const uid = match[1].toUpperCase();
        this.emit('tag', uid);
      }
      // Descarte silencioso de tramas que no cumplen con la especificación (RF-27)
    }
  }

  /**
   * Retorna una copia del estado actual del hardware.
   */
  public getStatus(): HardwareStatus {
    return { ...this.status };
  }

  /**
   * Indica si el puerto serial está actualmente conectado (ITagReader.isActive).
   */
  public isActive(): boolean {
    return this.status.connected;
  }

  /**
   * Inicia la conexión con el puerto serial (alias de connect para ITagReader).
   */
  public async start(portName?: string): Promise<void> {
    await this.connect(portName);
  }

  /**
   * Detiene la conexión serial (alias de disconnect para ITagReader).
   */
  public stop(): void {
    this.disconnect();
  }

  /**
   * Registra un callback para eventos de lectura de tag NFC con desuscripción.
   */
  public onTag(callback: (uid: string) => void): () => void {
    this.on('tag', callback);
    return () => {
      this.off('tag', callback);
    };
  }

  /**
   * Alias de onTag conforme al contrato unificado ITagReader.
   */
  public onTagDetected(callback: (uid: string) => void): () => void {
    return this.onTag(callback);
  }

  /**
   * Registra un callback para cambios en el estado del hardware con desuscripción.
   */
  public onStatus(callback: (status: HardwareStatus) => void): () => void {
    this.on('status', callback);
    return () => {
      this.off('status', callback);
    };
  }

  /**
   * Alias de onStatus conforme a la convención onStatusChange.
   */
  public onStatusChange(callback: (status: HardwareStatus) => void): () => void {
    return this.onStatus(callback);
  }

  /**
   * Simula la inyección de una trama UID serial en el gestor (ITagReader.simulateTag).
   */
  public async simulateTag(uid: string, delayMs = 0): Promise<void> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const cleanUid = uid.startsWith('UID:') ? uid.slice(4) : uid;
    this.processIncomingData(`UID:${cleanUid}\r\n`);
  }
}
