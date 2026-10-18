"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialManager = exports.InMemorySerialDriver = exports.DEFAULT_BAUD_RATE = exports.MAX_RECONNECT_ATTEMPTS = exports.RECONNECT_INTERVAL_MS = exports.SERIAL_FRAME_REGEX = void 0;
const events_1 = require("events");
/**
 * Expresión regular obligatoria de sanitización de tramas seriales NFC (RF-27).
 * Valida tramas con prefijo UID: y entre 8 y 14 caracteres hexadecimales.
 */
exports.SERIAL_FRAME_REGEX = /^UID:([0-9A-Fa-f]{8,14})$/;
/**
 * Intervalo de reconexión periódica en milisegundos (RF-34: 3000 ms).
 */
exports.RECONNECT_INTERVAL_MS = 3000;
/**
 * Límite máximo de intentos de reconexión automática (RF-34: 10 intentos).
 */
exports.MAX_RECONNECT_ATTEMPTS = 10;
/**
 * Tasa de baudios por defecto (RF-26: 115200 baudios, 8N1).
 */
exports.DEFAULT_BAUD_RATE = 115200;
/**
 * Implementación básica en memoria para entornos sin hardware real.
 */
class InMemorySerialDriver {
    isOpen = false;
    dataCallback;
    closeCallback;
    errorCallback;
    async open(_portName, _baudRate) {
        this.isOpen = true;
        return true;
    }
    async close() {
        this.isOpen = false;
    }
    onData(callback) {
        this.dataCallback = callback;
    }
    onClose(callback) {
        this.closeCallback = callback;
    }
    onError(callback) {
        this.errorCallback = callback;
    }
    emitData(chunk) {
        this.dataCallback?.(chunk);
    }
    emitClose() {
        this.isOpen = false;
        this.closeCallback?.();
    }
    emitError(error) {
        this.isOpen = false;
        this.errorCallback?.(error);
    }
}
exports.InMemorySerialDriver = InMemorySerialDriver;
/**
 * Gestor del enlace serial USB para el lector NFC (RF-27, RF-34).
 * Maneja el búfer de tramas entrantes, la sanitización sintáctica y la máquina de estados de reconexión.
 * Implementa ITagReader para compatibilidad con simuladores y abstracciones de hardware.
 */
class SerialManager extends events_1.EventEmitter {
    driver;
    reconnectIntervalMs;
    maxReconnectAttempts;
    baudRate;
    currentPort = null;
    buffer = '';
    reconnectTimer = null;
    isManualDisconnect = false;
    status = {
        connected: false,
        portName: null,
        reconnecting: false,
        attemptCount: 0,
    };
    constructor(options = {}) {
        super();
        this.driver = options.driver ?? new InMemorySerialDriver();
        this.reconnectIntervalMs = options.reconnectIntervalMs ?? exports.RECONNECT_INTERVAL_MS;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? exports.MAX_RECONNECT_ATTEMPTS;
        this.baudRate = options.baudRate ?? exports.DEFAULT_BAUD_RATE;
        this.currentPort = options.defaultPort ?? null;
        this.setupDriverListeners();
    }
    /**
     * Configura los listeners del driver de puerto serial.
     */
    setupDriverListeners() {
        this.driver.onData?.((chunk) => {
            this.processIncomingData(chunk);
        });
        this.driver.onClose?.(() => {
            this.handleUnexpectedDisconnection();
        });
        this.driver.onError?.((_err) => {
            this.handleUnexpectedDisconnection();
        });
    }
    /**
     * Conecta al puerto serial especificado o al puerto predeterminado.
     */
    async connect(portName) {
        this.clearReconnectTimer();
        this.isManualDisconnect = false;
        const targetPort = portName || this.currentPort || 'COM3';
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
        }
        catch {
            return false;
        }
    }
    /**
     * Desconecta intencionalmente el puerto serial y cancela cualquier ciclo de reconexión.
     */
    disconnect() {
        this.isManualDisconnect = true;
        this.clearReconnectTimer();
        void this.driver.close().catch(() => { });
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
    handleUnexpectedDisconnection() {
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
    scheduleNextReconnect() {
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            void this.attemptReconnect();
        }, this.reconnectIntervalMs);
    }
    /**
     * Ejecuta un intento de reconexión automática (RF-34).
     */
    async attemptReconnect() {
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
        }
        catch {
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
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    /**
     * Actualiza el estado interno de hardware y emite el evento 'status'.
     */
    updateStatus(newStatus) {
        this.status = { ...newStatus };
        this.emit('status', this.getStatus());
    }
    /**
     * Procesa fragmentos de datos entrantes desde el puerto serial,
     * manteniendo un búfer para tramas fragmentadas y sanitizando contra ruido (RF-27).
     */
    processIncomingData(chunk) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        this.buffer += text;
        // Protección contra acumulación excesiva de ruido sin delimitador
        if (this.buffer.length > 4096) {
            this.buffer = this.buffer.slice(-1024);
        }
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const rawLine = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);
            // Limpia retorno de carro y espacios en los extremos
            const line = rawLine.replace(/\r$/, '').trim();
            if (!line) {
                continue;
            }
            // Validación sintáctica estricta con SERIAL_FRAME_REGEX (RF-27)
            const match = line.match(exports.SERIAL_FRAME_REGEX);
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
    getStatus() {
        return { ...this.status };
    }
    /**
     * Indica si el puerto serial está actualmente conectado (ITagReader.isActive).
     */
    isActive() {
        return this.status.connected;
    }
    /**
     * Inicia la conexión con el puerto serial (alias de connect para ITagReader).
     */
    async start(portName) {
        await this.connect(portName);
    }
    /**
     * Detiene la conexión serial (alias de disconnect para ITagReader).
     */
    stop() {
        this.disconnect();
    }
    /**
     * Registra un callback para eventos de lectura de tag NFC con desuscripción.
     */
    onTag(callback) {
        this.on('tag', callback);
        return () => {
            this.off('tag', callback);
        };
    }
    /**
     * Alias de onTag conforme al contrato unificado ITagReader.
     */
    onTagDetected(callback) {
        return this.onTag(callback);
    }
    /**
     * Registra un callback para cambios en el estado del hardware con desuscripción.
     */
    onStatus(callback) {
        this.on('status', callback);
        return () => {
            this.off('status', callback);
        };
    }
    /**
     * Alias de onStatus conforme a la convención onStatusChange.
     */
    onStatusChange(callback) {
        return this.onStatus(callback);
    }
    /**
     * Simula la inyección de una trama UID serial en el gestor (ITagReader.simulateTag).
     */
    async simulateTag(uid, delayMs = 0) {
        if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        const cleanUid = uid.startsWith('UID:') ? uid.slice(4) : uid;
        this.processIncomingData(`UID:${cleanUid}\r\n`);
    }
}
exports.SerialManager = SerialManager;
//# sourceMappingURL=serial.manager.js.map