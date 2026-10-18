import React, { ReactNode } from 'react';
import type { Role, HardwareStatus } from '@vet-app/shared-types';
import { Sidebar, ScreenId } from './sidebar';
import { Header } from './header';
import styles from './main-layout.module.css';

export interface MainLayoutProps {
  activeScreen?: ScreenId;
  onSelectScreen?: (screen: ScreenId) => void;
  role?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  userName?: string;
  clinicName?: string;
  hardwareStatus?: HardwareStatus;
  onLogout?: () => void;
  className?: string;
  children: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  activeScreen = 'pet-list',
  onSelectScreen,
  role,
  userName,
  clinicName,
  hardwareStatus,
  onLogout,
  className,
  children,
}) => {
  const rootClass = [styles.layout, className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {/* Barra lateral de navegación condicional */}
      <Sidebar
        activeScreen={activeScreen}
        onSelectScreen={onSelectScreen}
        role={role}
      />

      {/* Contenedor vertical: Header superior + Área de contenido principal */}
      <div className={styles.contentWrapper}>
        <Header
          clinicName={clinicName}
          role={role}
          userName={userName}
          hardwareStatus={hardwareStatus}
          onLogout={onLogout}
        />

        <main className={styles.mainContent} role="main">
          {children}
        </main>
      </div>
    </div>
  );
};
