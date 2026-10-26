import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { Role, SerialPortInfo, HardwareStatus } from '@vet-app/shared-types';
import { fakeTagReader } from '../../readers/fake-tag-reader';
import {
  ClinicIcon,
  ClipboardIcon,
  PetIcon,
  CalendarIcon,
  StethoscopeIcon,
  SyringeIcon,
  UsersIcon,
  ShieldIcon,
  LockIcon,
  WarningIcon,
} from '../ui/icons';
import styles from './sidebar.module.css';

export type ScreenId =
  | 'login'
  | 'pet-list'
  | 'pet-register'
  | 'appointments'
  | 'clinical-record'
  | 'vet-agenda'
  | 'care-vaccination'
  | 'clinic-management'
  | 'staff-management'
  | 'users'
  | 'audit-logs'
  | string;

export interface NavItemConfig {
  id: ScreenId;
  label: string;
  icon: React.ReactNode;
}

export interface SidebarProps {
  activeScreen?: ScreenId;
  onSelectScreen?: (screen: ScreenId) => void;
  role?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  className?: string;
}

const RECEPTION_NAV_ITEMS: NavItemConfig[] = [
  { id: 'pet-list', label: 'Lista de Pacientes', icon: <ClipboardIcon size={16} /> },
  { id: 'pet-register', label: 'Registro de Mascota', icon: <PetIcon size={16} /> },
  { id: 'appointments', label: 'Agenda de Visitas', icon: <CalendarIcon size={16} /> },
];

const VET_NAV_ITEMS: NavItemConfig[] = [
  { id: 'pet-list', label: 'Lista de Pacientes', icon: <ClipboardIcon size={16} /> },
  { id: 'clinical-record', label: 'Ficha Clínica', icon: <StethoscopeIcon size={16} /> },
  { id: 'vet-agenda', label: 'Agenda de Consultas', icon: <CalendarIcon size={16} /> },
  { id: 'care-vaccination', label: 'Registro de Atención y Vacunación', icon: <SyringeIcon size={16} /> },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'clinic-management', label: 'Gestión de Clínica', icon: <ClinicIcon size={16} /> },
  { id: 'users', label: 'Personal (Usuarios)', icon: <UsersIcon size={16} /> },
  { id: 'pet-list', label: 'Pacientes', icon: <ClipboardIcon size={16} /> },
  { id: 'appointments', label: 'Agenda', icon: <CalendarIcon size={16} /> },
  { id: 'audit-logs', label: 'Auditoría', icon: <ShieldIcon size={16} /> },
];

const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { id: 'login', label: 'Iniciar Sesión', icon: <LockIcon size={16} /> },
  { id: 'pet-list', label: 'Lista de Pacientes', icon: <ClipboardIcon size={16} /> },
  { id: 'pet-register', label: 'Registro de Mascota', icon: <PetIcon size={16} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen = 'pet-list',
  onSelectScreen,
  role,
  className,
}) => {
  const [recentScan, setRecentScan] = useState<{ uid: string; time: string } | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [portError, setPortError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus>({
    connected: false,
    portName: null,
    reconnecting: false,
    attemptCount: 0,
    reason: null,
  });
  const showDevTools = import.meta.env?.VITE_DEV_TOOLS === 'true';

  // Manejador de nueva lectura de tarjeta NFC con temporizador de 10 segundos
  const handleNewScan = useCallback((uid: string) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeFormatted = `${hh}:${mm}:${ss}`;

    setRecentScan({ uid, time: timeFormatted });

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(() => {
      setRecentScan(null);
      scanTimeoutRef.current = null;
    }, 10000);
  }, []);

  // Consulta periódica y manual de puertos seriales disponibles (refresco cada 2 s)
  const refreshPorts = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.listSerialPorts) {
      try {
        const list = await window.electronAPI.listSerialPorts();
        const safeList = list || [];
        setPorts(safeList);
        setSelectedPort((current) => {
          if (current && safeList.some((p) => p.path === current)) {
            return current;
          }
          if (hardwareStatus.portName && safeList.some((p) => p.path === hardwareStatus.portName)) {
            return hardwareStatus.portName;
          }
          const esp = safeList.find((p) => p.isEsp32);
          return esp ? esp.path : safeList[0]?.path || '';
        });
      } catch {
        // Silencioso en caso de entorno sin soporte serial
      }
    }
  }, [hardwareStatus.portName]);

  // Suscripción al lector de tags, estado de hardware y refresco periódico cada 2 s
  useEffect(() => {
    const unsubscribe = fakeTagReader.onTag((uid) => {
      handleNewScan(uid);
    });

    let electronTagUnsub: (() => void) | undefined;
    let electronStatusUnsub: (() => void) | undefined;

    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.onTagDetected) {
        electronTagUnsub = window.electronAPI.onTagDetected((uid) => {
          handleNewScan(uid);
        });
      }

      if (window.electronAPI.getHardwareStatus) {
        window.electronAPI.getHardwareStatus().then((initialStatus) => {
          if (initialStatus) {
            setHardwareStatus(initialStatus);
          }
        }).catch(() => {});
      }

      if (window.electronAPI.onHardwareStatusChange) {
        electronStatusUnsub = window.electronAPI.onHardwareStatusChange((nextStatus) => {
          setHardwareStatus(nextStatus);
          if (nextStatus.connected && nextStatus.portName) {
            setSelectedPort(nextStatus.portName);
            setPortError(null);
          }
        });
      }
    }

    void refreshPorts();
    const intervalId = setInterval(() => {
      void refreshPorts();
    }, 2000);

    return () => {
      unsubscribe();
      electronTagUnsub?.();
      electronStatusUnsub?.();
      clearInterval(intervalId);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [handleNewScan, refreshPorts]);

  const handleConnectPort = async () => {
    if (!selectedPort || !window.electronAPI?.connectSerialPort) {
      return;
    }
    setIsConnecting(true);
    setPortError(null);
    try {
      const res = await window.electronAPI.connectSerialPort(selectedPort);
      if (!res.success) {
        setPortError(res.error || 'Error al conectar al puerto serial');
      } else {
        setPortError(null);
      }
    } catch (err: unknown) {
      setPortError((err as Error)?.message || 'Error al conectar al puerto serial');
    } finally {
      setIsConnecting(false);
      void refreshPorts();
    }
  };

  const handleSimulateTag = () => {
    const randomHex = Math.floor(Math.random() * 0xffffffffffff)
      .toString(16)
      .toUpperCase()
      .padStart(12, '0');
    const mockUid = `04${randomHex}`;
    fakeTagReader.emitTag(mockUid);

    if (typeof window !== 'undefined' && window.electronAPI?.simulateTagScan) {
      window.electronAPI.simulateTagScan(mockUid).catch(() => {});
    }
  };

  const getNavItems = (): NavItemConfig[] => {
    switch (role) {
      case 'RECEPTION':
        return RECEPTION_NAV_ITEMS;
      case 'VET':
        return VET_NAV_ITEMS;
      case 'ADMIN':
        return ADMIN_NAV_ITEMS;
      default:
        return DEFAULT_NAV_ITEMS;
    }
  };

  const navItems = getNavItems();
  const rootClass = [styles.sidebar, className].filter(Boolean).join(' ');

  return (
    <aside className={rootClass} role="complementary" aria-label="Menú principal de navegación">
      <div>
        <div className={styles.brand}>
          <PetIcon className={styles.brandIcon} aria-hidden="true" size={20} />
          <span className={styles.brandName}>VetApp</span>
          <span className={styles.brandTag}>Desktop</span>
        </div>

        {role && (
          <div className={styles.roleIndicator} aria-hidden="true">
            Rol: {role}
          </div>
        )}

        <nav className={styles.nav} aria-label="Navegación del sistema">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                onClick={() => onSelectScreen?.(item.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={styles.navIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Widget lector/simulador NFC */}
      <div className={styles.footer}>
        <div className={styles.nfcWidget}>
          <div className={styles.nfcHeader}>
            <span>Lector NFC</span>
            <span className={styles.nfcBadge}>{showDevTools ? 'Dev / Serial' : 'Serial USB'}</span>
          </div>

          <div className={styles.nfcStatusRow}>
            <span className={hardwareStatus.connected ? styles.statusConnected : styles.statusDisconnected}>
              {hardwareStatus.connected
                ? `Conectado: ${hardwareStatus.portName || selectedPort}`
                : hardwareStatus.reconnecting
                ? `Reconectando (${hardwareStatus.attemptCount}/10)...`
                : hardwareStatus.reason
                ? `Desconectado (${hardwareStatus.reason})`
                : 'Desconectado'}
            </span>
          </div>

          <div className={styles.nfcUid} data-testid="nfc-uid-display">
            {recentScan ? (
              <span>UID: {recentScan.uid} ({recentScan.time})</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Esperando llavero...</span>
            )}
          </div>

          {ports.length > 0 ? (
            <div className={styles.portSelectGroup}>
              <select
                className={styles.portSelect}
                value={selectedPort}
                onChange={(e) => {
                  setSelectedPort(e.target.value);
                  setPortError(null);
                }}
                aria-label="Seleccionar puerto serial"
              >
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <div className={styles.portActions}>
                <button
                  type="button"
                  className={styles.portConnectButton}
                  onClick={handleConnectPort}
                  disabled={isConnecting || !selectedPort}
                >
                  {isConnecting ? 'Conectando...' : 'Conectar puerto'}
                </button>
                <button
                  type="button"
                  className={styles.portRefreshButton}
                  onClick={() => void refreshPorts()}
                  title="Actualizar lista de puertos COM"
                >
                  Actualizar
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.noPortsGroup}>
              <span className={styles.noPortsText}>No se detectaron puertos COM</span>
              <button
                type="button"
                className={styles.portRefreshButton}
                onClick={() => void refreshPorts()}
              >
                Actualizar
              </button>
            </div>
          )}

          {portError && (
            <div role="alert" className={styles.portError}>
              <WarningIcon size={14} aria-hidden="true" />
              <span>{portError}</span>
            </div>
          )}

          {showDevTools && (
            <button
              type="button"
              className={styles.simulateButton}
              onClick={handleSimulateTag}
            >
              Simular lectura NFC
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
