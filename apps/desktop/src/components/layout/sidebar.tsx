import React, { useEffect, useState } from 'react';
import type { Role, SerialPortInfo } from '@vet-app/shared-types';
import { fakeTagReader } from '../../readers/fake-tag-reader';
import {
  ClinicIcon,
  ClipboardIcon,
  PetIcon,
  TagIcon,
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
  | 'tag-management'
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
  { id: 'tag-management', label: 'Búsqueda/Asignación de Tag', icon: <TagIcon size={16} /> },
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
  const [lastScannedUid, setLastScannedUid] = useState<string | null>(null);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [portError, setPortError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const showDevTools = import.meta.env?.VITE_DEV_TOOLS === 'true';

  // Suscripción al lector de tags (tanto la implementación simulada como eventos nativos)
  useEffect(() => {
    const unsubscribe = fakeTagReader.onTag((uid) => {
      setLastScannedUid(uid);
    });

    let electronUnsub: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onTagDetected) {
      electronUnsub = window.electronAPI.onTagDetected((uid) => {
        setLastScannedUid(uid);
      });
    }

    if (typeof window !== 'undefined' && window.electronAPI?.listSerialPorts) {
      window.electronAPI.listSerialPorts().then((list) => {
        if (list && list.length > 0) {
          setPorts(list);
          const esp = list.find((p) => p.isEsp32);
          setSelectedPort(esp ? esp.path : list[0].path);
        }
      }).catch(() => {});
    }

    return () => {
      unsubscribe();
      electronUnsub?.();
    };
  }, []);

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
      }
    } catch (err: unknown) {
      setPortError((err as Error)?.message || 'Error al conectar al puerto serial');
    } finally {
      setIsConnecting(false);
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

          <div className={styles.nfcUid}>
            {lastScannedUid ? (
              <span>UID: {lastScannedUid}</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Esperando llavero...</span>
            )}
          </div>

          {ports.length > 0 && (
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
              <button
                type="button"
                className={styles.portConnectButton}
                onClick={handleConnectPort}
                disabled={isConnecting || !selectedPort}
              >
                {isConnecting ? 'Conectando...' : 'Conectar puerto'}
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
