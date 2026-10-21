import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SerialPortMock } from 'serialport';
import {
  SerialPortDriver,
  SERIAL_LINE_REGEX,
  ESP32_VID_PID_PATTERNS,
  type RawPortInfo,
} from '../../electron/serialport.driver.ts';
import { SerialManager } from '../../electron/serial.manager.ts';

describe('SerialPortDriver (apps/desktop/electron/serialport.driver.ts - RF-66, RF-67, RT-1)', () => {
  const TEST_PORT_PATH = 'COM_MOCK_ESP32';

  beforeEach(() => {
    try {
      SerialPortMock.binding.reset();
    } catch {
      // reset no disponible o ya limpio
    }
    SerialPortMock.binding.createPort(TEST_PORT_PATH, { echo: true, record: true });
  });

  afterEach(async () => {
    try {
      SerialPortMock.binding.reset();
    } catch {
      // ignore
    }
    delete process.env.SERIAL_PORT;
  });

  describe('1. Sanitización de Tramas y Filtrado de Ruido de Arranque ESP32 (RF-66)', () => {
    it('debe procesar tramas válidas de 8 caracteres hexadecimales (^UID:[0-9A-F]{8}$)', async () => {
      const driver = new SerialPortDriver({ serialPortClass: SerialPortMock });
      const receivedLines: string[] = [];

      driver.onData((chunk) => {
        receivedLines.push(chunk.toString());
      });

      const opened = await driver.open(TEST_PORT_PATH);
      assert.equal(opened, true);
      assert.equal(driver.isOpen, true);

      // Inyectar trama válida terminada en \r\n
      const mockPort = (driver as unknown as { portInstance: { port: { emitData: (b: Buffer) => void } } })
        .portInstance?.port;
      assert.ok(mockPort, 'El puerto subyacente mock debe estar activo');

      mockPort.emitData(Buffer.from('UID:04A1B2C3\r\n'));

      // Dar tiempo para el ciclo de lectura del stream
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedLines.length, 1);
      assert.equal(receivedLines[0], 'UID:04A1B2C3\r\n');

      await driver.close();
      assert.equal(driver.isOpen, false);
    });

    it('debe procesar tramas válidas de 14 caracteres hexadecimales (^UID:[0-9A-F]{14}$)', async () => {
      const driver = new SerialPortDriver({ serialPortClass: SerialPortMock });
      const receivedLines: string[] = [];
      driver.onData((chunk) => receivedLines.push(chunk.toString()));

      await driver.open(TEST_PORT_PATH);
      const mockPort = (driver as unknown as { portInstance: { port: { emitData: (b: Buffer) => void } } })
        .portInstance?.port;
      assert.ok(mockPort);

      mockPort.emitData(Buffer.from('UID:04A1B2C3D4E5F6\r\n'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedLines.length, 1);
      assert.equal(receivedLines[0], 'UID:04A1B2C3D4E5F6\r\n');

      await driver.close();
    });

    it('debe descartar completamente logs de arranque y bootloader del ESP32', async () => {
      const driver = new SerialPortDriver({ serialPortClass: SerialPortMock });
      const receivedLines: string[] = [];
      driver.onData((chunk) => receivedLines.push(chunk.toString()));

      await driver.open(TEST_PORT_PATH);
      const mockPort = (driver as unknown as { portInstance: { port: { emitData: (b: Buffer) => void } } })
        .portInstance?.port;
      assert.ok(mockPort);

      // Simular secuencia real de arranque de MicroPython/ESP32
      mockPort.emitData(Buffer.from('ets Jun  8 2016 00:22:57\r\n'));
      mockPort.emitData(Buffer.from('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n'));
      mockPort.emitData(Buffer.from('configsip: 0, SPIWP:0xee\r\n'));
      mockPort.emitData(Buffer.from('clk_drv:0x00,q_drv:0x00,d_drv:0x00,cs0_drv:0x00\r\n'));
      mockPort.emitData(Buffer.from('MicroPython v1.22.0 on 2024-01-01; ESP32 module with ESP32\r\n'));
      mockPort.emitData(Buffer.from('Type "help()" for more information.\r\n'));

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(
        receivedLines.length,
        0,
        'Ningún mensaje de bootloader o consola debe propagarse al callback de datos'
      );

      // Ahora emitir una trama legítima y comprobar que sí pasa
      mockPort.emitData(Buffer.from('UID:DEADBEEF\r\n'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedLines.length, 1);
      assert.equal(receivedLines[0], 'UID:DEADBEEF\r\n');

      await driver.close();
    });

    it('debe rechazar tramas malformadas, longitudes inválidas o no hexadecimales', async () => {
      const driver = new SerialPortDriver({ serialPortClass: SerialPortMock });
      const receivedLines: string[] = [];
      driver.onData((chunk) => receivedLines.push(chunk.toString()));

      await driver.open(TEST_PORT_PATH);
      const mockPort = (driver as unknown as { portInstance: { port: { emitData: (b: Buffer) => void } } })
        .portInstance?.port;
      assert.ok(mockPort);

      // 7 caracteres (muy corto)
      mockPort.emitData(Buffer.from('UID:1234567\r\n'));
      // 16 caracteres (demasiado largo)
      mockPort.emitData(Buffer.from('UID:010203040506070809\r\n'));
      // Caracteres fuera de rango hex
      mockPort.emitData(Buffer.from('UID:04A1ZZC3\r\n'));
      // Prefijo incorrecto
      mockPort.emitData(Buffer.from('TAG:04A1B2C3\r\n'));
      // Minúsculas no conformes
      mockPort.emitData(Buffer.from('UID:04a1b2c3\r\n'));

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(receivedLines.length, 0, 'Todas las tramas inválidas deben ser descartadas');

      await driver.close();
    });
  });

  describe('2. Autodetección de ESP32 por VID/PID y Selección de Puerto (RF-66)', () => {
    it('debe reconocer adaptadores CP210x (10C4:EA60) y CH340 (1A86:7523)', () => {
      assert.equal(
        SerialPortDriver.isEsp32Device({ vendorId: '10C4', productId: 'EA60' }),
        true,
        'CP210x debe ser reconocido'
      );
      assert.equal(
        SerialPortDriver.isEsp32Device({ vendorId: '10c4', productId: 'ea60' }),
        true,
        'Debe ser insensible a mayúsculas/minúsculas'
      );
      assert.equal(
        SerialPortDriver.isEsp32Device({ vendorId: '1A86', productId: '7523' }),
        true,
        'CH340 debe ser reconocido'
      );
      assert.equal(
        SerialPortDriver.isEsp32Device({ vendorId: '0403', productId: '6001' }),
        false,
        'FTDI estándar u otros no deben ser clasificados como ESP32'
      );
      assert.equal(
        SerialPortDriver.isEsp32Device({ vendorId: undefined, productId: undefined }),
        false,
        'Puertos sin VID/PID no deben ser ESP32'
      );
    });

    it('detectEsp32Port debe seleccionar el puerto con VID/PID de ESP32', async () => {
      const mockList: RawPortInfo[] = [
        { path: 'COM1', manufacturer: 'Microsoft', vendorId: '0000', productId: '0000' },
        { path: 'COM4', manufacturer: 'Silicon Labs', vendorId: '10C4', productId: 'EA60' },
        { path: 'COM9', manufacturer: 'Unknown' },
      ];

      const detected = await SerialPortDriver.detectEsp32Port(async () => mockList);
      assert.equal(detected, 'COM4');
    });

    it('detectEsp32Port debe priorizar la variable de entorno SERIAL_PORT si está definida', async () => {
      process.env.SERIAL_PORT = 'COM99';

      const mockList: RawPortInfo[] = [
        { path: 'COM4', vendorId: '10C4', productId: 'EA60' },
      ];

      const detected = await SerialPortDriver.detectEsp32Port(async () => mockList);
      assert.equal(detected, 'COM99');
    });

    it('listAvailablePorts debe clasificar y formatear nombres para la UI', async () => {
      const mockList: RawPortInfo[] = [
        { path: 'COM3', friendlyName: 'Puerto Bluetooth COM3' },
        { path: 'COM7', manufacturer: 'WCH.CN', vendorId: '1A86', productId: '7523' },
      ];

      const result = await SerialPortDriver.listAvailablePorts(async () => mockList);
      assert.equal(result.length, 2);

      assert.equal(result[0].path, 'COM3');
      assert.equal(result[0].isEsp32, false);

      assert.equal(result[1].path, 'COM7');
      assert.equal(result[1].isEsp32, true);
      assert.ok(result[1].displayName.includes('(ESP32)'));
    });
  });

  describe('3. Manejo de Contención y Puerto Ocupado (ej. Thonny) (RF-67)', () => {
    it('debe reportar mensaje claro cuando el puerto está ocupado por otra aplicación', async () => {
      class BusySerialPortMock {
        public isOpen = false;
        public opts: { path: string };
        constructor(opts: { path: string }) {
          this.opts = opts;
        }
        public open(cb: (err: Error | null) => void): void {
          const err = new Error('Access is denied (port busy)');
          (err as unknown as { code: string }).code = 'EACCES';
          cb(err);
        }
        public close(cb: (err: Error | null) => void): void {
          cb(null);
        }
      }

      const driver = new SerialPortDriver({ serialPortClass: BusySerialPortMock });
      const opened = await driver.open('COM4');

      assert.equal(opened, false);
      assert.equal(driver.isOpen, false);

      const lastError = driver.getLastError();
      assert.ok(lastError);
      assert.ok(
        lastError.includes('ocupado o en uso por otra aplicación'),
        `El mensaje debe indicar ocupación: ${lastError}`
      );
      assert.ok(
        lastError.includes('Thonny'),
        `El mensaje debe mencionar herramientas concurrentes comunes: ${lastError}`
      );
    });
  });

  describe('4. Integración con SerialManager: Reconexión y Agotamiento de Reintentos (RF-66, RF-34)', () => {
    it('debe reconectar automáticamente hasta 10 intentos y pasar a DESCONECTADO', async () => {
      class FlakySerialPortMock {
        public static shouldFail = false;
        public isOpen = false;
        public opts: { path: string };
        constructor(opts: { path: string }) {
          this.opts = opts;
        }
        public open(cb: (err: Error | null) => void): void {
          if (FlakySerialPortMock.shouldFail) {
            const err = new Error('Port disconnected');
            cb(err);
            return;
          }
          this.isOpen = true;
          cb(null);
        }
        public pipe(): { on: () => void } {
          return { on: () => {} };
        }
        public on(): void {}
        public close(cb: (err: Error | null) => void): void {
          this.isOpen = false;
          cb(null);
        }
      }

      FlakySerialPortMock.shouldFail = false;
      const driver = new SerialPortDriver({ serialPortClass: FlakySerialPortMock });

      const manager = new SerialManager({
        driver,
        reconnectIntervalMs: 10, // Intervalo rápido para test
        maxReconnectAttempts: 10,
        defaultPort: 'COM_FLAKY',
      });

      const initialConnect = await manager.connect();
      assert.equal(initialConnect, true);
      assert.equal(manager.getStatus().connected, true);

      // Simular desconexión física y fallo permanente en las reconexiones
      FlakySerialPortMock.shouldFail = true;
      (driver as unknown as { closeCallback?: () => void }).closeCallback?.();

      // Verificar que entra en estado reconectando
      assert.equal(manager.getStatus().connected, false);
      assert.equal(manager.getStatus().reconnecting, true);

      // Esperar a que se consuman los 10 intentos (10 * 10ms + margen = ~250ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      const finalStatus = manager.getStatus();
      assert.equal(
        finalStatus.connected,
        false,
        'Debe permanecer desconectado al agotar intentos'
      );
      assert.equal(
        finalStatus.reconnecting,
        false,
        'reconnecting debe ser false al agotar los 10 reintentos'
      );
      assert.equal(
        finalStatus.attemptCount,
        10,
        'attemptCount debe haber alcanzado el límite normativo de 10'
      );

      manager.disconnect();
    });
  });
});
