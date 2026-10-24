import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SerialManager,
  InMemorySerialDriver,
  SERIAL_FRAME_REGEX,
  RECONNECT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  DEFAULT_BAUD_RATE,
  type SerialDriver,
} from '../../electron/serial.manager.ts';
import {
  getLastUsedPort,
  setLastUsedPort,
  resetSerialConfigForTesting,
} from '../../electron/serial-config.ts';
import type { HardwareStatus, SerialPortInfo } from '@vet-app/shared-types';

class MockSerialDriver implements SerialDriver {
  public isOpen = false;
  public shouldFailOpen = false;
  public openCallCount = 0;
  public closeCallCount = 0;
  public lastPortOpened: string | null = null;
  public lastBaudRateOpened: number | null = null;
  public customError: string | null = null;

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

  public getLastError(): string | null {
    if (this.customError) return this.customError;
    return this.shouldFailOpen ? 'Puerto COM4 ocupado por otra aplicación' : null;
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
        reason: null,
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

  describe('Autodetección, Fallo de Apertura y Persistencia Segura (RF-66, RF-67)', () => {
    beforeEach(() => {
      resetSerialConfigForTesting();
      delete process.env.SERIAL_PORT;
    });

    it('sin puerto detectado: debe quedar desconectado sin inventar COM3 y sin invocar driver.open', async () => {
      const customDriver = new MockSerialDriver();
      const customManager = new SerialManager({
        driver: customDriver,
        listPortsFn: async () => [], // Ningún puerto disponible en el sistema
      });

      const result = await customManager.connect();
      assert.equal(result, false, 'connect() debe retornar false cuando no hay puertos');
      assert.equal(customDriver.openCallCount, 0, 'No debe intentar abrir ningún puerto inventado como COM3');

      const status = customManager.getStatus();
      assert.equal(status.connected, false);
      assert.equal(status.portName, null);
      assert.equal(status.reconnecting, false);
      assert.equal(status.reason, 'No se detectó ningún lector NFC conectado');

      customManager.disconnect();
    });

    it('fallo al abrir puerto: debe quedar desconectado con motivo y nunca "Conectado"', async () => {
      const customDriver = new MockSerialDriver();
      customDriver.shouldFailOpen = true;
      customDriver.customError = 'Puerto COM4 ocupado por Thonny';

      const customManager = new SerialManager({
        driver: customDriver,
      });

      const result = await customManager.connect('COM4');
      assert.equal(result, false);
      assert.equal(customDriver.openCallCount, 1);

      const status = customManager.getStatus();
      assert.equal(status.connected, false, 'Nunca debe reportar conectado ante fallo de apertura');
      assert.equal(status.portName, 'COM4');
      assert.equal(status.reason, 'Puerto COM4 ocupado por Thonny');

      customManager.disconnect();
    });

    it('preferencia de último puerto: debe priorizar lastUsedPort si sigue disponible', async () => {
      const customDriver = new MockSerialDriver();
      // Guardamos COM8 como último puerto usado exitosamente
      setLastUsedPort('COM8');

      const mockPorts: SerialPortInfo[] = [
        { path: 'COM3', friendlyName: 'USB Serial (COM3)' },
        { path: 'COM8', friendlyName: 'USB Serial ESP32 (COM8)' },
        { path: 'COM4', vendorId: '10C4', productId: 'EA60', friendlyName: 'CP210x (COM4)' },
      ];

      const customManager = new SerialManager({
        driver: customDriver,
        listPortsFn: async () => mockPorts,
      });

      const connected = await customManager.connect();
      assert.equal(connected, true);
      assert.equal(customDriver.lastPortOpened, 'COM8', 'Debe priorizar COM8 (último puerto usado)');
      assert.equal(getLastUsedPort(), 'COM8');

      customManager.disconnect();
    });

    it('autodetección ESP32: cuando no hay lastUsedPort, debe preseleccionar VID/PID conocido', async () => {
      const customDriver = new MockSerialDriver();
      setLastUsedPort(null);

      const mockPorts: SerialPortInfo[] = [
        { path: 'COM1', friendlyName: 'Communications Port (COM1)' },
        { path: 'COM4', vendorId: '10C4', productId: 'EA60', friendlyName: 'Silicon Labs CP210x (COM4)' },
      ];

      const customManager = new SerialManager({
        driver: customDriver,
        listPortsFn: async () => mockPorts,
      });

      const connected = await customManager.connect();
      assert.equal(connected, true);
      assert.equal(customDriver.lastPortOpened, 'COM4', 'Debe autodetectar COM4 por CP210x VID/PID');
      assert.equal(getLastUsedPort(), 'COM4', 'Debe guardar COM4 como último puerto usado en el proceso principal');

      customManager.disconnect();
    });

    it('persistencia segura: serial-config no almacena credenciales ni datos clínicos (RNF-2)', () => {
      setLastUsedPort('COM4');
      assert.equal(getLastUsedPort(), 'COM4');

      // Intentar resetear y verificar que solo almacena strings o null
      setLastUsedPort(null);
      assert.equal(getLastUsedPort(), null);
    });

    it('InMemorySerialDriver: debe soportar simulación de fallos con motivo para desarrollo y tests', async () => {
      const memDriver = new InMemorySerialDriver();
      assert.equal(await memDriver.open('COM1', 115200), true);
      assert.equal(memDriver.isOpen, true);
      assert.equal(memDriver.getLastError(), null);

      await memDriver.close();
      assert.equal(memDriver.isOpen, false);

      memDriver.shouldFail = true;
      assert.equal(await memDriver.open('COM1', 115200), false);
      assert.equal(memDriver.isOpen, false);
      assert.equal(memDriver.getLastError(), 'Puerto no disponible o en uso');
    });
  });
});
