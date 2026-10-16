import React, { useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { ScreenId } from './components/layout/Sidebar';
import { LoginScreen } from './screens/LoginScreen';
import { PetListScreen } from './screens/PetListScreen';
import { PetRegisterScreen } from './screens/PetRegisterScreen';

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('login');

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'login':
        return <LoginScreen />;
      case 'pet-list':
        return <PetListScreen />;
      case 'pet-register':
        return <PetRegisterScreen />;
      default:
        return <LoginScreen />;
    }
  };

  return (
    <MainLayout activeScreen={activeScreen} onSelectScreen={setActiveScreen}>
      {renderActiveScreen()}
    </MainLayout>
  );
};
