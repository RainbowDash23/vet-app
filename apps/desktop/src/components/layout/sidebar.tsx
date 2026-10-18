import React, { useEffect, useState } from 'react';
import type { Role } from '@vet-app/shared-types';
import { fakeTagReader } from '../../readers/fake-tag-reader';
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
  | 'audit-logs'
  | string;

export interface NavItemConfig {
  id: ScreenId;
  label: string;
  icon: string;
}

export interface SidebarProps {
  activeScreen?: ScreenId;
  onSelectScreen?: (screen: ScreenId) => void;
  role?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  className?: string;
}

const RECEPTION_NAV_ITEMS: NavItemConfig[] = [
  { id: 'pet-list', label: 'Lista de Pacientes', icon: '📋' },
  { id: 'pet-register', label: 'Registro de Mascota', icon: '🐶' },
  { id: 'tag-management', label: 'Búsqueda/Asignación de Tag', icon: '🏷️' },
  { id: 'appointments', label: 'Agenda de Visitas', icon: '📅' },
];

const VET_NAV_ITEMS: NavItemConfig[] = [
  { id: 'pet-list', label: 'Lista de Pacientes', icon: '📋' },
  { id: 'clinical-record', label: 'Ficha Clínica', icon: '🩺' },
  { id: 'vet-agenda', label: 'Agenda de Consultas', icon: '📅' },
  { id: 'care-vaccination', label: 'Registro de Atención y Vacunación', icon: '💉' },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'clinic-management', label: 'Gestión de Clínica', icon: '🏥' },
  { id: 'staff-management', label: 'Personal', icon: '👥' },
  { id: 'pet-list', label: 'Pacientes', icon: '📋' },
  { id: 'appointments', label: 'Agenda', icon: '📅' },
  { id: 'audit-logs', label: 'Auditoría', icon: '🛡️' },
];

const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { id: 'login', label: 'Iniciar Sesión', icon: '🔐' },
  { id: 'pet-list', label: 'Lista de Pacientes', icon: '📋' },
  { id: 'pet-register', label: 'Registro de Mascota', icon: '🐶' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen = 'pet-list',
  onSelectScreen,
  role,
  className,
}) => {
  const [lastScannedUid, setLastScannedUid] = useState<string | null>(null);

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

    return () => {
      unsubscribe();
      electronUnsub?.();
    };
  }, []);

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
          <div className={styles.brandIcon} aria-hidden="true">🐾</div>
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
            <span className={styles.nfcBadge}>Simulador</span>
          </div>

          <div className={styles.nfcUid}>
            {lastScannedUid ? (
              <span>UID: {lastScannedUid}</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Esperando llavero...</span>
            )}
          </div>

          <button
            type="button"
            className={styles.simulateButton}
            onClick={handleSimulateTag}
          >
            📡 Simular lectura NFC
          </button>
        </div>
      </div>
    </aside>
  );
};
