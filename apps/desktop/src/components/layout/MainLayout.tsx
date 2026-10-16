import React, { ReactNode } from 'react';
import { ScreenId, Sidebar } from './Sidebar';
import styles from './MainLayout.module.css';

interface MainLayoutProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  children: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  activeScreen,
  onSelectScreen,
  children,
}) => {
  return (
    <div className={styles.layout}>
      <Sidebar activeScreen={activeScreen} onSelectScreen={onSelectScreen} />
      <main className={styles.mainContent}>{children}</main>
    </div>
  );
};
