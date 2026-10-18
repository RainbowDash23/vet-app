import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SerialManager,
  SERIAL_FRAME_REGEX,
  RECONNECT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  DEFAULT_BAUD_RATE,
  type SerialDriver,
} from '../../electron/serial.manager.ts';
import type { HardwareStatus } from '@vet-app/shared-types';

class MockSerialDriver implements SerialDriver {
  public isOpen = false;
  public shouldFailOpen = false;
  public openCallCount = 0;
  public closeCallCount = 0;
  public lastPortOpened: string | null = null;
  public lastBaudRateOpened: number | null = null;

  private dataCallback?: (chunk: string | Buffer) => void;
  private closeCallback?: () => void;
  private errorCallback?: (error: Error) => void;

  public async open(portName: string, baudRate: number): Promise<boolean> {
    this.openCallCount++;
    this.lastPortOpened = portName;
    this.lastBaudRateOpened = baudRate;
    if (this.shouldFailOpen) {
      this.isOpen = false;
      return false;
    }
    this.isOpen = true;
    return true;
  }

  public async close(): Promise<void> {
    this.closeCallCount++;
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

  public emitError(err: Error): void {
    this.isOpen = false;
    this.errorCallback?.(err);
  }
}

describe('SerialManager (apps/desktop/electron/serial.manager.ts)', () => {
  let mockDriver: MockSerialDriver;
  let manager: SerialManager;

  beforeEach(() => {
    mockDriver = new MockSerialDriver();
    manager = new SerialManager({
      driver: mockDriver,
      reconnectIntervalMs: 15, // intervalo rápido para tests deterministas
      maxReconnectAttempts: 10,
    });
  });

  afterEach(() => {
    manager.disconnect();
  });

  describe('Constantes y Expresión Regular de Sanitización (RF-27)', () => {
    it('debe tener los valores de configuración serial requeridos por RF-26 y RF-34', () => {
      assert.equal(RECONNECT_INTERVAL_MS, 3000);
      assert.equal(MAX_RECONNECT_ATTEMPTS, 10);
      assert.equal(DEFAULT_BAUD_RATE, 115200);
    });

    it('debe validar tramas hexadecimales válidas de 8 a 14 caracteres con prefijo UID:', () => {
      assert.ok(SERIAL_FRAME_REGEX.test('UID:04A1B2C3'));
      assert.ok(SERIAL_FRAME_REGEX.test('UID:04A1B2C3D4E5F6'));
      assert.ok(SERIAL_FRAME_REGEX.test('UID:aabbccdd'));
      assert.ok(SERIAL_FRAME_REGEX.test('UID:12345678'));
    });

    it('debe rechazar tramas malformadas, longitudes inválidas o caracteres no hexadecimales', () => {
      assert.equal(SERIAL_FRAME_REGEX.test('UID:1234567'), false, 'Menos de 8 caracteres debe fallar');
      assert.equal(SERIAL_FRAME_REGEX.test('UID:010203040506070809'), false, 'Más de 14 caracteres debe fallar');
      assert.equal(SERIAL_FRAME_REGEX.test('UID:04A1ZZC3'), false, 'Letras fuera de hex deben fallar');
      assert.equal(SERIAL_FRAME_REGEX.test('ERR:INVALID'), false, 'Prefijo no UID debe fallar');
      assert.equal(SERIAL_FRAME_REGEX.test('04A1B2C3'), false, 'Sin prefijo UID: debe fallar');
    });
  });

  describe('Conexión y Estado Inicial', () => {
    it('debe iniciar en estado desconectado y sin reintento activo', () => {
      const status = manager.getStatus();
      assert.deepEqual(status, {
        connected: false,
        portName: null,
        reconnecting: false,
        attemptCount: 0,
      });
    });

    it('debe conectar exitosamente a 115200 baudios y actualizar estado', async () => {
      const statuses: HardwareStatus[] = [];
      manager.onStatus((s) => statuses.push(s));

      const connected = await manager.connect('COM4');
      assert.equal(connected, true);
      assert.equal(mockDriver.isOpen, true);
      assert.equal(mockDriver.lastPortOpened, 'COM4');
      assert.equal(mockDriver.lastBaudRateOpened, 115200);

      const status = manager.getStatus();
      assert.equal(status.connected, true);
      assert.equal(status.portName, 'COM4');
      assert.equal(status.reconnecting, false);
      assert.equal(status.attemptCount, 0);

      assert.ok(statuses.length >= 1);
      assert.equal(statuses[statuses.length - 1].connected, true);
    });

    it('debe permitir desconexión manual limpiando listeners y estado', async () => {
      await manager.connect('COM4');
      manager.disconnect();

      assert.equal(mockDriver.isOpen, false);
      const status = manager.getStatus();
      assert.equal(status.connected, false);
      assert.equal(status.portName, null);
      assert.equal(status.reconnecting, false);
      assert.equal(status.attemptCount, 0);
    });
  });

  describe('Procesamiento y Sanitización de Tramas Seriales (RF-27)', () => {
    beforeEach(async () => {
      await manager.connect('COM3');
    });

    it('debe procesar trama válida UID:04A1B2C3\\r\\n y emitir el UID normalizado en mayúsculas', () => {
      const tags: string[] = [];
      const unsubscribe = manager.onTag((uid) => tags.push(uid));

      manager.processIncomingData('UID:04a1b2c3\r\n');

      assert.equal(tags.length, 1);
      assert.equal(tags[0], '04A1B2C3');

      unsubscribe();
      manager.processIncomingData('UID:04A1B2C3\r\n');
      assert.equal(tags.length, 1, 'Tras desuscribirse no debe recibir nuevos eventos');
    });

    it('debe descartar silenciosamente tramas con ruido, basura o formato anómalo', () => {
      const tags: string[] = [];
      manager.onTag((uid) => tags.push(uid));

      manager.processIncomingData('ERR:MALFORMED_DATA\r\n');
      manager.processIncomingData('NOISE@@@###\r\n');
      manager.processIncomingData('UID:ZZZZZZZZ\r\n');
      manager.processIncomingData('\r\n');
      manager.processIncomingData('   \r\n');
      manager.processIncomingData('UID:12\r\n');

      assert.equal(tags.length, 0, 'Ninguna trama con ruido debe emitir evento de tag');
    });

    it('debe manejar tramas fragmentadas recibidas en chunks parciales en el búfer', () => {
      const tags: string[] = [];
      manager.onTag((uid) => tags.push(uid));

      // Envío fraccionado: 'UI' -> 'D:04A1' -> 'B2C3\r\n'
      manager.processIncomingData('UI');
      assert.equal(tags.length, 0);

      manager.processIncomingData('D:04A1');
      assert.equal(tags.length, 0);

      manager.processIncomingData('B2C3\r\n');
      assert.equal(tags.length, 1);
      assert.equal(tags[0], '04A1B2C3');
    });

    it('debe procesar múltiples tramas consecutivas en un mismo chunk', () => {
      const tags: string[] = [];
      manager.onTag((uid) => tags.push(uid));

      manager.processIncomingData('UID:11223344\r\nUID:AABBCCDD\n');

      assert.equal(tags.length, 2);
      assert.equal(tags[0], '11223344');
      assert.equal(tags[1], 'AABBCCDD');
    });

    it('debe recibir datos emitidos por el driver subyacente a través de su listener', () => {
      const tags: string[] = [];
      manager.onTag((uid) => tags.push(uid));

      mockDriver.emitData(Buffer.from('UID:CAFEBABE\r\n'));

      assert.equal(tags.length, 1);
      assert.equal(tags[0], 'CAFEBABE');
    });
  });

  describe('Máquina de Estados de Reconexión Automática (RF-34)', () => {
    it('debe detectar desconexión inesperada y cambiar a reconnecting con attemptCount: 1', async () => {
      await manager.connect('COM3');

      const statuses: HardwareStatus[] = [];
      manager.onStatus((s) => statuses.push({ ...s }));

      // Simula desconexión física por el driver
      mockDriver.emitClose();

      const currentStatus = manager.getStatus();
      assert.equal(currentStatus.connected, false);
      assert.equal(currentStatus.reconnecting, true);
      assert.equal(currentStatus.attemptCount, 1);
      assert.equal(currentStatus.portName, 'COM3');

      const reconnectingStatus = statuses.find((s) => s.reconnecting === true && s.attemptCount === 1);
      assert.ok(reconnectingStatus, 'Debe emitir estado con reconnecting: true y attemptCount: 1');
    });

    it('debe incrementar attemptCount en cada reintento fallido periódico', async () => {
      mockDriver.shouldFailOpen = true; // Forzar fallos de apertura
      await manager.connect('COM3');

      // Disparar desconexión inesperada
      mockDriver.emitClose();

      // Esperar tiempo suficiente para que ocurran 2 reintentos (intervalo configurado en 15ms)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = manager.getStatus();
      assert.equal(status.connected, false);
      assert.ok((status.attemptCount ?? 0) >= 2, `attemptCount debe ser al menos 2, obtenido: ${status.attemptCount}`);
    });

    it('debe detener la reconexión automática tras alcanzar el límite de 10 intentos (RF-34)', async () => {
      mockDriver.shouldFailOpen = true; // Siempre falla
      await manager.connect('COM5');

      mockDriver.emitClose();

      // Esperar tiempo suficiente para agotar los 10 intentos (10 * 15ms = 150ms + margen para timers en Windows)
      const start = Date.now();
      while (manager.getStatus().reconnecting && Date.now() - start < 800) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const finalStatus = manager.getStatus();
      assert.equal(finalStatus.connected, false);
      assert.equal(finalStatus.reconnecting, false, 'reconnecting debe pasar a false al alcanzar el límite');
      assert.equal(finalStatus.attemptCount, 10, 'attemptCount debe detenerse exactamente en 10');
    });

    it('debe restablecer estado a connected: true y attemptCount: 0 ante reconexión exitosa', async () => {
      await manager.connect('COM5');
      mockDriver.shouldFailOpen = true; // Falla temporalmente durante el reintento

      mockDriver.emitClose();
      assert.equal(manager.getStatus().reconnecting, true);

      // Esperamos un intento fallido
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok((manager.getStatus().attemptCount ?? 0) >= 1);

      // Ahora restauramos el hardware (el siguiente reintento será exitoso)
      mockDriver.shouldFailOpen = false;

      // Esperamos a que el siguiente ciclo de reconexión se complete
      await new Promise((resolve) => setTimeout(resolve, 35));

      const recoveredStatus = manager.getStatus();
      assert.equal(recoveredStatus.connected, true);
      assert.equal(recoveredStatus.reconnecting, false);
      assert.equal(recoveredStatus.attemptCount, 0);
      assert.equal(recoveredStatus.portName, 'COM5');
    });
  });
});
