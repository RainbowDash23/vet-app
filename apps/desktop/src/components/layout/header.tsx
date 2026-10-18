import React from 'react';
import type { Role, HardwareStatus } from '@vet-app/shared-types';
import { HardwareStatusIndicator } from './hardware-status-indicator';
import styles from './header.module.css';

export interface HeaderProps {
  clinicName?: string;
  role?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  userName?: string;
  hardwareStatus?: HardwareStatus;
  onLogout?: () => void;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  clinicName = 'Clínica Veterinaria Central',
  role,
  userName,
  hardwareStatus,
  onLogout,
  className,
}) => {
  const getRoleBadgeClass = (r?: Role | 'ADMIN' | 'VET' | 'RECEPTION') => {
    switch (r) {
      case 'ADMIN':
        return styles.roleBadgeAdmin;
      case 'VET':
        return styles.roleBadgeVet;
      case 'RECEPTION':
        return styles.roleBadgeReception;
      default:
        return styles.roleBadgeReception;
    }
  };

  const rootClass = [styles.header, className].filter(Boolean).join(' ');

  return (
    <header className={rootClass} role="banner">
      <div className={styles.leftSection}>
        <div className={styles.clinicBadge}>
          <span className={styles.clinicIcon} aria-hidden="true">🏥</span>
          <span className={styles.clinicName}>{clinicName}</span>
        </div>
      </div>

      <div className={styles.rightSection}>
        {/* Indicador de estado de Hardware Serial / Lector USB */}
        <HardwareStatusIndicator status={hardwareStatus} />

        {/* Insignia de Rol RBAC */}
        {role && (
          <span
            className={`${styles.roleBadge} ${getRoleBadgeClass(role)}`}
            aria-label={`Rol de usuario: ${role}`}
          >
            {role}
          </span>
        )}

        {/* Información de Usuario y Cierre de Sesión */}
        {(userName || onLogout) && (
          <div className={styles.userSection}>
            {userName && <span className={styles.userName}>{userName}</span>}
            {onLogout && (
              <button
                type="button"
                className={styles.logoutButton}
                onClick={onLogout}
                aria-label="Cerrar sesión"
              >
                <span aria-hidden="true">🚪</span>
                <span>Cerrar Sesión</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
