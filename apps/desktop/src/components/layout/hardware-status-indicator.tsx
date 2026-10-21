import React, { useEffect, useState } from 'react';
import type { HardwareStatus } from '@vet-app/shared-types';
import styles from './hardware-status-indicator.module.css';

export interface HardwareStatusIndicatorProps {
  status?: HardwareStatus;
  className?: string;
}

const DEFAULT_DISCONNECTED_STATUS: HardwareStatus = {
  connected: false,
  reconnecting: false,
  attemptCount: 0,
  portName: null,
};

export const HardwareStatusIndicator: React.FC<HardwareStatusIndicatorProps> = ({
  status: statusProp,
  className,
}) => {
  const [internalStatus, setInternalStatus] = useState<HardwareStatus>(
    statusProp ?? DEFAULT_DISCONNECTED_STATUS
  );

  // Sincronizar o suscribir a cambios de hardware serial (RF-34)
  useEffect(() => {
    if (statusProp !== undefined) {
      setInternalStatus(statusProp);
      return;
    }

    if (typeof window !== 'undefined' && window.electronAPI) {
      // Consulta de estado inicial si la API está disponible
      window.electronAPI.getHardwareStatus?.().then((initialStatus) => {
        if (initialStatus) {
          setInternalStatus(initialStatus);
        }
      }).catch(() => {
        // En caso de error o entorno sin Electron, se mantiene el estado desconectado seguro
      });

      // Suscripción reactiva a eventos de cambio de hardware
      const unsubscribe = window.electronAPI.onHardwareStatusChange?.((nextStatus) => {
        setInternalStatus(nextStatus);
      });

      return () => {
        unsubscribe?.();
      };
    }
  }, [statusProp]);

  const currentStatus = statusProp ?? internalStatus;

  const isConnected = currentStatus.connected;
  const isReconnecting = !isConnected && currentStatus.reconnecting === true;
  const isDisconnected = !isConnected && !isReconnecting;

  // Límite normativo de 10 intentos según RF-34
  const attemptCount = Math.min(Math.max(currentStatus.attemptCount ?? 1, 1), 10);
  const portDisplay = currentStatus.portName ?? 'Puerto Serial';

  // Determinación de clases y atributos accesibles
  let statusClass = styles.disconnected;
  let dotClass = styles.dotDisconnected;
  let ariaLabel = 'Hardware serial desconectado';

  if (isConnected) {
    statusClass = styles.connected;
    dotClass = styles.dotConnected;
    ariaLabel = `Hardware serial conectado en ${portDisplay}`;
  } else if (isReconnecting) {
    statusClass = styles.reconnecting;
    dotClass = styles.dotReconnecting;
    ariaLabel = `Reintentando conexión con hardware serial, intento ${attemptCount} de 10`;
  }

  const rootClass = [styles.indicator, statusClass, className].filter(Boolean).join(' ');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={rootClass}
    >
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />

      {isConnected && (
        <span className={styles.label}>
          <span>Conectado</span>
          <span className={styles.portName}>{portDisplay}</span>
        </span>
      )}

      {isDisconnected && (
        <span className={styles.label}>Hardware Desconectado</span>
      )}

      {isReconnecting && (
        <span className={styles.label}>
          Reintentando conexión ({attemptCount}/10)
        </span>
      )}
    </div>
  );
};
