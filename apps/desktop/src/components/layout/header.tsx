import React from 'react';
import type { Role, HardwareStatus } from '@vet-app/shared-types';
import { HardwareStatusIndicator } from './hardware-status-indicator';
import { ClinicIcon, LogoutIcon, SearchIcon, SunIcon, MoonIcon } from '../ui/icons';
import { useTheme } from '../../context/theme-context';
import styles from './header.module.css';

export interface HeaderProps {
  clinicName?: string;
  role?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  userName?: string;
  hardwareStatus?: HardwareStatus;
  onLogout?: () => void;
  className?: string;
  onOpenQuickSearch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  clinicName = 'Clínica Veterinaria Central',
  role,
  userName,
  hardwareStatus,
  onLogout,
  className,
  onOpenQuickSearch,
}) => {
  const { theme, toggleTheme } = useTheme();

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
          <ClinicIcon className={styles.clinicIcon} aria-hidden="true" size={16} />
          <span className={styles.clinicName}>{clinicName}</span>
        </div>

        {onOpenQuickSearch && (
          <button
            type="button"
            className={styles.quickSearchBtn}
            onClick={onOpenQuickSearch}
            data-testid="header-quick-search-btn"
            aria-label="Abrir búsqueda rápida (Ctrl+K)"
          >
            <SearchIcon size={14} aria-hidden="true" />
            <span className={styles.quickSearchText}>Buscar...</span>
            <kbd className={styles.quickSearchKbd}>Ctrl+K</kbd>
          </button>
        )}
      </div>

      <div className={styles.rightSection}>
        {/* Conmutador de Tema Claro / Oscuro (RNF-3) */}
        <button
          type="button"
          className={styles.themeToggleBtn}
          onClick={toggleTheme}
          data-testid="header-theme-toggle-btn"
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? (
            <SunIcon size={16} aria-hidden="true" />
          ) : (
            <MoonIcon size={16} aria-hidden="true" />
          )}
        </button>

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

        {/* Información de Usuario y Cierre de Sesión (solo visible para usuario autenticado) */}
        {(userName || role) && (
          <div className={styles.userSection}>
            {userName && <span className={styles.userName}>{userName}</span>}
            {onLogout && (
              <button
                type="button"
                className={styles.logoutButton}
                onClick={onLogout}
                aria-label="Cerrar sesión"
              >
                <LogoutIcon aria-hidden="true" size={15} />
                <span>Cerrar Sesión</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
