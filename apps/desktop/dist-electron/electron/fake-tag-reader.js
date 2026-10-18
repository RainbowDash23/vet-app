"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeTagReader = exports.FAKE_TAG_UID_REGEX = void 0;
/**
 * Expresión regular para validación estricta de UID de 8 a 14 caracteres hexadecimales (RF-27).
 */
exports.FAKE_TAG_UID_REGEX = /^[0-9A-Fa-f]{8,14}$/;
/**
 * Simulador de hardware lector NFC para entornos de desarrollo y pruebas automatizadas (RF-27, RNF-4, RNF-5).
 * Implementa el contrato ITagReader y permite inyectar UIDs artificiales, emular latencia física y secuencias.
 */
class FakeTagReader {
    active = false;
    currentStatus = {
        connected: false,
        portName: null,
        reconnecting: false,
        attemptCount: 0,
    };
    tagCallbacks = new Set();
    statusCallbacks = new Set();
    pendingCancelers = new Set();
    /**
     * Activa el lector simulado y conmuta su estado a conectado.
     */
    start() {
        this.active = true;
        this.currentStatus = {
            connected: true,
            portName: 'SIMULATOR',
            reconnecting: false,
            attemptCount: 0,
        };
        this.notifyStatusListeners();
    }
    /**
     * Detiene el lector, cancela temporizadores pendientes y conmuta a desconectado.
     */
    stop() {
        this.active = false;
        // Cancela y rechaza cualquier operación asíncrona o retardo en curso
        for (const cancel of Array.from(this.pendingCancelers)) {
            cancel();
        }
        this.pendingCancelers.clear();
        this.currentStatus = {
            connected: false,
            portName: null,
            reconnecting: false,
            attemptCount: 0,
        };
        this.notifyStatusListeners();
    }
    /**
     * Suscribe un callback para eventos de lectura de tag NFC.
     * @returns Función de desuscripción limpia.
     */
    onTagDetected(callback) {
        this.tagCallbacks.add(callback);
        return () => {
            this.tagCallbacks.delete(callback);
        };
    }
    /**
     * Alias de conveniencia compatible con onTagDetected.
     */
    onTag(callback) {
        return this.onTagDetected(callback);
    }
    /**
     * Suscribe un callback para cambios de estado del hardware simulado.
     * @returns Función de desuscripción limpia.
     */
    onStatusChange(callback) {
        this.statusCallbacks.add(callback);
        return () => {
            this.statusCallbacks.delete(callback);
        };
    }
    /**
     * Alias de conveniencia compatible con onStatusChange.
     */
    onStatus(callback) {
        return this.onStatusChange(callback);
    }
    /**
     * Inyecta un UID artificial simulando la lectura de un tag NFC físico (RF-27, RNF-4, RNF-5).
     * @param uid Identificador del tag (con o sin prefijo 'UID:').
     * @param delayMs Retardo opcional en milisegundos para simular latencia física de lectura.
     */
    async simulateTag(uid, delayMs = 0) {
        if (!this.active) {
            throw new Error('FakeTagReader is not active');
        }
        const trimmed = uid.trim();
        const raw = trimmed.startsWith('UID:') ? trimmed.slice(4).trim() : trimmed;
        if (!exports.FAKE_TAG_UID_REGEX.test(raw)) {
            throw new Error('Invalid UID format');
        }
        const normalizedUid = raw.toUpperCase();
        if (delayMs > 0) {
            await new Promise((resolve, reject) => {
                let timer;
                const cancel = () => {
                    clearTimeout(timer);
                    this.pendingCancelers.delete(cancel);
                    reject(new Error('FakeTagReader is not active'));
                };
                this.pendingCancelers.add(cancel);
                timer = setTimeout(() => {
                    this.pendingCancelers.delete(cancel);
                    if (!this.active) {
                        reject(new Error('FakeTagReader is not active'));
                    }
                    else {
                        resolve();
                    }
                }, delayMs);
            });
        }
        if (!this.active) {
            throw new Error('FakeTagReader is not active');
        }
        this.notifyTagListeners(normalizedUid);
    }
    /**
     * Emite una secuencia ordenada de UIDs con retardo configurable entre emisiones para pruebas e2e.
     */
    async simulateSequence(uids, intervalMs = 100) {
        if (!this.active) {
            throw new Error('FakeTagReader is not active');
        }
        for (let i = 0; i < uids.length; i++) {
            if (!this.active) {
                throw new Error('FakeTagReader is not active');
            }
            const uid = uids[i];
            await this.simulateTag(uid, 0);
            if (i < uids.length - 1 && intervalMs > 0) {
                await new Promise((resolve, reject) => {
                    let timer;
                    const cancel = () => {
                        clearTimeout(timer);
                        this.pendingCancelers.delete(cancel);
                        reject(new Error('FakeTagReader is not active'));
                    };
                    this.pendingCancelers.add(cancel);
                    timer = setTimeout(() => {
                        this.pendingCancelers.delete(cancel);
                        if (!this.active) {
                            reject(new Error('FakeTagReader is not active'));
                        }
                        else {
                            resolve();
                        }
                    }, intervalMs);
                });
            }
        }
    }
    /**
     * Conmuta el estado del simulador a desconectado.
     */
    simulateDisconnect() {
        this.currentStatus = {
            connected: false,
            portName: null,
            reconnecting: false,
            attemptCount: 0,
        };
        this.notifyStatusListeners();
    }
    /**
     * Conmuta el estado del simulador a conectado.
     */
    simulateReconnect() {
        this.currentStatus = {
            connected: true,
            portName: 'SIMULATOR',
            reconnecting: false,
            attemptCount: 0,
        };
        this.notifyStatusListeners();
    }
    /**
     * Retorna una copia del estado actual del hardware simulado.
     */
    getStatus() {
        return { ...this.currentStatus };
    }
    /**
     * Indica si el lector simulado se encuentra actualmente activo.
     */
    isActive() {
        return this.active;
    }
    notifyTagListeners(uid) {
        for (const callback of this.tagCallbacks) {
            try {
                callback(uid);
            }
            catch (error) {
                console.error('[FakeTagReader] Error en callback de tag:', error);
            }
        }
    }
    notifyStatusListeners() {
        const statusCopy = this.getStatus();
        for (const callback of this.statusCallbacks) {
            try {
                callback(statusCopy);
            }
            catch (error) {
                console.error('[FakeTagReader] Error en callback de estado:', error);
            }
        }
    }
}
exports.FakeTagReader = FakeTagReader;
//# sourceMappingURL=fake-tag-reader.js.map