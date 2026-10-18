import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTagReader } from '../../electron/fake-tag-reader.ts';
import type { ITagReader } from '../../src/readers/tag-reader.interface.ts';
import { SerialManager } from '../../electron/serial.manager.ts';
import type { HardwareStatus } from '@vet-app/shared-types';

describe('FakeTagReader (apps/desktop/electron/fake-tag-reader.ts)', () => {
  let reader: FakeTagReader;

  beforeEach(() => {
    reader = new FakeTagReader();
  });

  afterEach(() => {
    reader.stop();
  });

  describe('1. Interfaz ITagReader y Estado Inicial', () => {
    it('debe implementar el contrato ITagReader con métodos start, stop, onTagDetected, getStatus, isActive', () => {
      const tagReader: ITagReader = reader;
      assert.strictEqual(typeof tagReader.start, 'function');
      assert.strictEqual(typeof tagReader.stop, 'function');
      assert.strictEqual(typeof tagReader.onTagDetected, 'function');
      assert.strictEqual(typeof tagReader.simulateTag, 'function');
      assert.strictEqual(typeof tagReader.getStatus, 'function');
      assert.strictEqual(typeof tagReader.isActive, 'function');
    });

    it('debe iniciar inactivo con estado desconectado', () => {
      assert.strictEqual(reader.isActive(), false);
      const status = reader.getStatus();
      assert.deepStrictEqual(status, {
        connected: false,
        portName: null,
        reconnecting: false,
        attemptCount: 0,
      });
    });
  });

  describe('2. Ciclo de Vida y Transiciones de Estado (start / stop / listeners)', () => {
    it('start() debe activar el lector y conmutar estado a connected: true con portName "SIMULATOR"', () => {
      reader.start();
      assert.strictEqual(reader.isActive(), true);
      const status = reader.getStatus();
      assert.deepStrictEqual(status, {
        connected: true,
        portName: 'SIMULATOR',
        reconnecting: false,
        attemptCount: 0,
      });
    });

    it('start() debe notificar a los listeners suscritos mediante onStatusChange', () => {
      const recordedStatuses: HardwareStatus[] = [];
      const unsubscribe = reader.onStatusChange((status) => {
        recordedStatuses.push(status);
      });

      reader.start();

      assert.strictEqual(recordedStatuses.length, 1);
      assert.deepStrictEqual(recordedStatuses[0], {
        connected: true,
        portName: 'SIMULATOR',
        reconnecting: false,
        attemptCount: 0,
      });

      unsubscribe();
    });

    it('stop() debe desactivar el lector, limpiar temporizadores y conmutar a connected: false', () => {
      reader.start();
      assert.strictEqual(reader.isActive(), true);

      const recordedStatuses: HardwareStatus[] = [];
      reader.onStatusChange((status) => {
        recordedStatuses.push(status);
      });

      reader.stop();

      assert.strictEqual(reader.isActive(), false);
      const status = reader.getStatus();
      assert.deepStrictEqual(status, {
        connected: false,
        portName: null,
        reconnecting: false,
        attemptCount: 0,
      });
      assert.strictEqual(recordedStatuses.length, 1);
      assert.strictEqual(recordedStatuses[0].connected, false);
    });

    it('simulateDisconnect() y simulateReconnect() deben conmutar estado y notificar listeners', () => {
      reader.start();
      const recordedStatuses: HardwareStatus[] = [];
      reader.onStatusChange((status) => {
        recordedStatuses.push(status);
      });

      reader.simulateDisconnect();
      assert.strictEqual(reader.getStatus().connected, false);
      assert.strictEqual(recordedStatuses.length, 1);
      assert.strictEqual(recordedStatuses[0].connected, false);

      reader.simulateReconnect();
      assert.strictEqual(reader.getStatus().connected, true);
      assert.strictEqual(recordedStatuses.length, 2);
      assert.strictEqual(recordedStatuses[1].connected, true);
    });

    it('debe permitir desuscribir listeners de onStatusChange limpiamente', () => {
      let callCount = 0;
      const unsubscribe = reader.onStatusChange(() => {
        callCount++;
      });

      reader.start();
      assert.strictEqual(callCount, 1);

      unsubscribe();
      reader.stop();
      assert.strictEqual(callCount, 1, 'No debe invocarse tras desuscribir');
    });
  });

  describe('3. Inyección de UIDs mediante simulateTag (RF-27, RNF-4)', () => {
    it('debe emitir UID válido a todos los listeners suscritos cuando isActive === true', async () => {
      reader.start();
      const emittedUidsA: string[] = [];
      const emittedUidsB: string[] = [];

      const unsubA = reader.onTagDetected((uid) => emittedUidsA.push(uid));
      const unsubB = reader.onTagDetected((uid) => emittedUidsB.push(uid));

      await reader.simulateTag('04A1B2C3');

      assert.deepStrictEqual(emittedUidsA, ['04A1B2C3']);
      assert.deepStrictEqual(emittedUidsB, ['04A1B2C3']);

      unsubA();
      unsubB();
    });

    it('debe normalizar UIDs en minúsculas a mayúsculas', async () => {
      reader.start();
      let capturedUid = '';
      reader.onTagDetected((uid) => {
        capturedUid = uid;
      });

      await reader.simulateTag('04a1b2c3d4e5f6');
      assert.strictEqual(capturedUid, '04A1B2C3D4E5F6');
    });

    it('debe admitir prefijo UID: opcional sanitizándolo correctamente', async () => {
      reader.start();
      let capturedUid = '';
      reader.onTagDetected((uid) => {
        capturedUid = uid;
      });

      await reader.simulateTag('UID:04A1B2C3D4');
      assert.strictEqual(capturedUid, '04A1B2C3D4');
    });

    it('debe permitir desuscribir listeners de onTagDetected de forma limpia', async () => {
      reader.start();
      const emittedUids: string[] = [];
      const unsubscribe = reader.onTagDetected((uid) => emittedUids.push(uid));

      await reader.simulateTag('04A1B2C3');
      assert.strictEqual(emittedUids.length, 1);

      unsubscribe();
      await reader.simulateTag('04D5E6F7');
      assert.strictEqual(emittedUids.length, 1, 'No debe recibir tags tras desuscribirse');
    });
  });

  describe('4. Validación Sintáctica y Manejo de Errores (RF-27)', () => {
    it('debe rechazar simulateTag con error si el lector está inactivo (isActive === false)', async () => {
      assert.strictEqual(reader.isActive(), false);
      await assert.rejects(
        async () => {
          await reader.simulateTag('04A1B2C3');
        },
        {
          name: 'Error',
          message: 'FakeTagReader is not active',
        }
      );
    });

    it('debe rechazar UIDs con longitud menor a 8 caracteres hexadecimales', async () => {
      reader.start();
      await assert.rejects(
        async () => {
          await reader.simulateTag('04A1B2'); // 6 chars
        },
        {
          name: 'Error',
          message: 'Invalid UID format',
        }
      );
    });

    it('debe rechazar UIDs con longitud mayor a 14 caracteres hexadecimales', async () => {
      reader.start();
      await assert.rejects(
        async () => {
          await reader.simulateTag('04A1B2C3D4E5F6AA'); // 16 chars
        },
        {
          name: 'Error',
          message: 'Invalid UID format',
        }
      );
    });

    it('debe rechazar UIDs con caracteres no hexadecimales o símbolos inválidos', async () => {
      reader.start();
      await assert.rejects(
        async () => {
          await reader.simulateTag('04A1B2C3XYZ!');
        },
        {
          name: 'Error',
          message: 'Invalid UID format',
        }
      );
    });

    it('debe rechazar UIDs vacíos o cadenas con solo espacios', async () => {
      reader.start();
      await assert.rejects(
        async () => {
          await reader.simulateTag('   ');
        },
        {
          name: 'Error',
          message: 'Invalid UID format',
        }
      );
    });
  });

  describe('5. Retardo Simulado y Benchmarking de Latencia (RNF-5)', () => {
    it('debe soportar retardo delayMs simulando latencia física de lectura (< 600 ms)', async () => {
      reader.start();
      let capturedUid = '';
      reader.onTagDetected((uid) => {
        capturedUid = uid;
      });

      const delayMs = 50;
      const startTime = Date.now();
      await reader.simulateTag('04A1B2C3', delayMs);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(capturedUid, '04A1B2C3');
      assert.ok(elapsed >= 40, `El tiempo transcurrido (${elapsed}ms) debe ser al menos ~50ms`);
      assert.ok(elapsed < 600, `El tiempo transcurrido (${elapsed}ms) debe cumplir RNF-5 (< 600ms)`);
    });

    it('no debe emitir el tag si el lector es detenido durante el retardo', async () => {
      reader.start();
      const emittedUids: string[] = [];
      reader.onTagDetected((uid) => emittedUids.push(uid));

      const promise = reader.simulateTag('04A1B2C3', 100);
      // Detenemos antes de que termine el retardo
      reader.stop();

      await assert.rejects(
        async () => {
          await promise;
        },
        {
          name: 'Error',
          message: 'FakeTagReader is not active',
        }
      );

      assert.strictEqual(emittedUids.length, 0, 'No debe haber emitido el UID');
    });
  });

  describe('6. Emisión de Secuencias Continuas con simulateSequence() para Pruebas E2E', () => {
    it('debe emitir secuencialmente múltiples UIDs en el orden exacto con intervalo entre ellos', async () => {
      reader.start();
      const emittedUids: string[] = [];
      reader.onTagDetected((uid) => emittedUids.push(uid));

      const testUids = ['04A1B2C3', '04D4E5F6', '04112233445566'];
      await reader.simulateSequence(testUids, 15);

      assert.deepStrictEqual(emittedUids, testUids);
    });

    it('debe rechazar la secuencia si el lector no está activo al iniciar', async () => {
      assert.strictEqual(reader.isActive(), false);
      await assert.rejects(
        async () => {
          await reader.simulateSequence(['04A1B2C3']);
        },
        {
          name: 'Error',
          message: 'FakeTagReader is not active',
        }
      );
    });
  });

  describe('7. Compatibilidad de SerialManager con ITagReader', () => {
    it('SerialManager debe implementar ITagReader con métodos start, stop, onTagDetected, isActive, getStatus', () => {
      const serialManager = new SerialManager();
      const tagReader: ITagReader = serialManager;

      assert.strictEqual(typeof tagReader.start, 'function');
      assert.strictEqual(typeof tagReader.stop, 'function');
      assert.strictEqual(typeof tagReader.onTagDetected, 'function');
      assert.strictEqual(typeof tagReader.getStatus, 'function');
      assert.strictEqual(typeof tagReader.isActive, 'function');
    });
  });
});
