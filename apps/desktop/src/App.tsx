import React, { useState } from 'react';
import { MainLayout, ScreenId } from './components/layout';
import { AuthProvider, useAuth } from './context/auth.context';
import { LoginScreen } from './screens/login-screen';
import { PetListScreen } from './screens/PetListScreen';
import { PetRegisterScreen } from './screens/PetRegisterScreen';
import { ScheduleScreen } from './screens/schedule-screen';

const AppContent: React.FC = () => {
  const { isAuthenticated, user, role, logout } = useAuth();
  const [activeScreen, setActiveScreen] = useState<ScreenId>('login');

  const handleLoginSuccess = () => {
    setActiveScreen('pet-list');
  };

  const handleLogout = async () => {
    await logout();
    setActiveScreen('login');
  };

  const renderActiveScreen = () => {
    if (!isAuthenticated) {
      return <LoginScreen onSuccess={handleLoginSuccess} />;
    }

    switch (activeScreen) {
      case 'login':
        return <LoginScreen onSuccess={handleLoginSuccess} />;
      case 'pet-list':
        return <PetListScreen />;
      case 'pet-register':
        return <PetRegisterScreen />;
      case 'appointments':
      case 'vet-agenda':
        return <ScheduleScreen clinicId={user?.clinicId} />;
      default:
        return <PetListScreen />;
    }
  };

  return (
    <MainLayout
      activeScreen={activeScreen}
      onSelectScreen={setActiveScreen}
      role={role ?? undefined}
      userName={user?.name}
      clinicName={user?.clinicId ? `Clínica (${user.clinicId})` : undefined}
      onLogout={handleLogout}
    >
      {renderActiveScreen()}
    </MainLayout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
