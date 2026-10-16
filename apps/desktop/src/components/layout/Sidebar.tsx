import React, { useEffect, useState } from 'react';
import { fakeTagReader } from '../../readers/fake-tag-reader';
import styles from './Sidebar.module.css';

export type ScreenId = 'login' | 'pet-list' | 'pet-register';

interface SidebarProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeScreen, onSelectScreen }) => {
  const [lastScannedUid, setLastScannedUid] = useState<string | null>(null);

  // Suscripción al lector de tags (tanto la implementación falsa como eventos de Electron)
  useEffect(() => {
    const unsubscribe = fakeTagReader.onTag((uid) => {
      setLastScannedUid(uid);
    });
    return () => unsubscribe();
  }, []);

  const handleSimulateTag = () => {
    // Genera un UID aleatorio hexadecimal de 7 bytes (14 caracteres) o usa uno fijo representativo
    const randomHex = Math.floor(Math.random() * 0xffffffffffff)
      .toString(16)
      .toUpperCase()
      .padStart(12, '0');
    const mockUid = `04${randomHex}`;
    fakeTagReader.emitTag(mockUid);
  };

  return (
    <aside className={styles.sidebar}>
      <div>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🐾</div>
          <span className={styles.brandName}>VetApp</span>
          <span className={styles.brandTag}>Desktop</span>
        </div>

        <nav className={styles.nav}>
          <button
            type="button"
            className={`${styles.navItem} ${activeScreen === 'login' ? styles.navItemActive : ''}`}
            onClick={() => onSelectScreen('login')}
          >
            <span className={styles.navIcon}>🔐</span>
            <span>Iniciar Sesión</span>
          </button>

          <button
            type="button"
            className={`${styles.navItem} ${activeScreen === 'pet-list' ? styles.navItemActive : ''}`}
            onClick={() => onSelectScreen('pet-list')}
          >
            <span className={styles.navIcon}>📋</span>
            <span>Lista de Mascotas</span>
          </button>

          <button
            type="button"
            className={`${styles.navItem} ${activeScreen === 'pet-register' ? styles.navItemActive : ''}`}
            onClick={() => onSelectScreen('pet-register')}
          >
            <span className={styles.navIcon}>🐶</span>
            <span>Registro de Mascota</span>
          </button>
        </nav>
      </div>

      {/* Widget simulador de lector NFC */}
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
