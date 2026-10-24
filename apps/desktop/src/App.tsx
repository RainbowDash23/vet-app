import React, { useState, useEffect, useCallback } from 'react';
import type { ResolveTagSuccessDto } from '@vet-app/shared-types';
import { MainLayout, ScreenId } from './components/layout';
import { AuthProvider, useAuth } from './context/auth.context';
import { LoginScreen } from './screens/login-screen';
import loginStyles from './screens/login-screen.module.css';
import { PetListScreen } from './screens/PetListScreen';
import { PetRegisterScreen } from './screens/PetRegisterScreen';
import { OwnerRegisterScreen } from './screens/OwnerRegisterScreen';
import { PatientFileScreen } from './screens/patient-file-screen';
import { VisitConsultationScreen } from './screens/visit-consultation-screen';
import { ScheduleScreen } from './screens/schedule-screen';
import { UsersScreen } from './screens/users-screen';
import { UnsavedChangesDialog } from './components/screens/unsaved-changes-dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from './components/ui';
import {
  useFormDirtyGuard,
  DirtyGuardContext,
} from './hooks/use-form-dirty-guard';
import { petsService as defaultPetsService, PetsService } from './services/pets.service';
import { ownersService as defaultOwnersService, OwnersService } from './services/owners.service';
import { apiClient as defaultApiClient, ApiClient, ApiError } from './services/api.client';

export interface AppContentProps {
  initialScreen?: ScreenId;
  petsServiceInstance?: PetsService;
  apiClientInstance?: ApiClient;
  ownersServiceInstance?: OwnersService;
}

export const AppContent: React.FC<AppContentProps> = ({
  initialScreen,
  petsServiceInstance = defaultPetsService,
  apiClientInstance = defaultApiClient,
  ownersServiceInstance,
}) => {
  const { isAuthenticated, user, role, logout } = useAuth();
  const ownersService = React.useMemo(
    () => ownersServiceInstance ?? (apiClientInstance ? new OwnersService(apiClientInstance) : defaultOwnersService),
    [ownersServiceInstance, apiClientInstance]
  );
  const [activeScreen, setActiveScreen] = useState<ScreenId>(
    initialScreen ?? (isAuthenticated ? 'pet-list' : 'login')
  );

  // Estados de entidad clínica y navegación reactiva por NFC
  const [activePetUid, setActivePetUid] = useState<string | undefined>(undefined);
  const [activePetId, setActivePetId] = useState<string | undefined>(undefined);
  const [activeTagData, setActiveTagData] = useState<ResolveTagSuccessDto | undefined>(undefined);
  const [prefilledNfcUid, setPrefilledNfcUid] = useState<string | undefined>(undefined);
  const [activeVisitId, setActiveVisitId] = useState<string | undefined>(undefined);

  // Nombre comercial de la clínica activa (RF-70: nunca mostrar UUID)
  const [clinicCommercialName, setClinicCommercialName] = useState<string>('Clínica Veterinaria Central');

  // Alerta modal accesible ante consentimiento revocado (HTTP 403)
  const [revocationAlert, setRevocationAlert] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  // Si cambia el estado de autenticación y no hay initialScreen forzado
  useEffect(() => {
    if (!initialScreen) {
      if (isAuthenticated) {
        setActiveScreen((prev) => (prev === 'login' ? 'pet-list' : prev));
      } else {
        setActiveScreen('login');
      }
    }
  }, [isAuthenticated, initialScreen]);

  // Carga del nombre comercial de la clínica activa mediante GET /clinics/current (RF-70)
  useEffect(() => {
    let mounted = true;
    if (isAuthenticated && user?.clinicId) {
      apiClientInstance
        .get<{ id: string; name: string }>('/clinics/current')
        .then((clinic) => {
          if (mounted && clinic?.name) {
            setClinicCommercialName(clinic.name);
          }
        })
        .catch(() => {
          if (mounted) {
            // Fallback institucional en caso de indisponibilidad temporal
            setClinicCommercialName('Clínica Veterinaria');
          }
        });
    } else {
      setClinicCommercialName('Clínica Veterinaria Central');
    }

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, user?.clinicId, apiClientInstance]);

  /**
   * Resuelve el UID escaneado y enruta a la pantalla correspondiente (RF-70, RT-2).
   */
  const resolveScannedTag = useCallback(
    async (uid: string) => {
      if (!isAuthenticated) {
        // Sin sesión activa se ignora el escaneo
        return;
      }

      try {
        const res = await petsServiceInstance.resolveTag(uid);

        if (!res.registered) {
          // Tag no asignado: redirige a PetRegisterScreen con UID precargado
          setPrefilledNfcUid(res.uid || uid);
          setActiveScreen('pet-register');
          return;
        }

        // Mascota registrada: navega al expediente clínico completo
        const successData = res as ResolveTagSuccessDto;
        setActivePetUid(uid);
        setActivePetId(successData.pet && 'id' in successData.pet ? successData.pet.id : undefined);
        setActiveTagData(successData);
        setActiveScreen('clinical-record');
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          // Vínculo revocado o no autorizado (RF-70)
          setRevocationAlert({
            isOpen: true,
            message:
              'Acceso denegado (HTTP 403): El consentimiento o vínculo de atención médica para este paciente ha sido REVOCADO. La clínica no cuenta con autorización activa para acceder al expediente ni registrar visitas.',
          });
          return;
        }

        console.error('Error al resolver llavero NFC:', error);
      }
    },
    [isAuthenticated, petsServiceInstance]
  );

  // Guardia de navegación ante cambios no guardados con escucha NFC reactiva (RF-33, RF-70)
  const dirtyGuard = useFormDirtyGuard({
    onResolveTag: (uid) => {
      void resolveScannedTag(uid);
    },
    autoListenNfc: isAuthenticated,
  });

  const handleLoginSuccess = () => {
    setActiveScreen('pet-list');
  };

  const handleLogout = async () => {
    await logout();
    dirtyGuard.resetGuard();
    setActivePetUid(undefined);
    setActivePetId(undefined);
    setActiveTagData(undefined);
    setPrefilledNfcUid(undefined);
    setActiveVisitId(undefined);
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
        return (
          <PetRegisterScreen
            initialNfcUid={prefilledNfcUid}
            petsServiceInstance={petsServiceInstance}
            ownersServiceInstance={ownersService}
            onNavigateToOwnerRegister={() => setActiveScreen('owner-register')}
            onNavigateToPetFile={(petId) => {
              setActivePetId(petId);
              setActiveScreen('clinical-record');
            }}
          />
        );
      case 'owner-register':
        return (
          <OwnerRegisterScreen
            ownersServiceInstance={ownersService}
            onOwnerCreated={() => setActiveScreen('pet-register')}
            onNavigateToPetRegister={() => setActiveScreen('pet-register')}
          />
        );
      case 'clinical-record':
        return (
          <PatientFileScreen
            currentClinicId={user?.clinicId}
            petsService={petsServiceInstance}
            uid={activePetUid}
            petId={activePetId}
            initialData={activeTagData}
            autoListenNfc={false}
            onUnregisteredTag={(unregisteredUid) => {
              setPrefilledNfcUid(unregisteredUid);
              setActiveScreen('pet-register');
            }}
            onBack={() => setActiveScreen('pet-list')}
          />
        );
      case 'care-vaccination':
        return (
          <VisitConsultationScreen
            visitId={activeVisitId}
            onCloseScreen={() => {
              setActiveVisitId(undefined);
              setActiveScreen('clinical-record');
            }}
          />
        );
      case 'appointments':
      case 'vet-agenda':
        return <ScheduleScreen clinicId={user?.clinicId} />;
      case 'users':
      case 'staff-management':
        return <UsersScreen currentUserRole={role ?? undefined} />;
      default:
        return <PetListScreen />;
    }
  };

  // Si no existe sesión autenticada, renderiza únicamente el formulario de login centrado sin MainLayout
  if (!isAuthenticated) {
    return (
      <div className={loginStyles.pageWrapper}>
        <LoginScreen onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <DirtyGuardContext.Provider value={dirtyGuard}>
      <MainLayout
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        role={role ?? undefined}
        userName={user?.name}
        clinicName={clinicCommercialName}
        onLogout={handleLogout}
      >
        {renderActiveScreen()}
      </MainLayout>

      {/* Diálogo accesible ante cambios no guardados en formularios activos (RF-33) */}
      <UnsavedChangesDialog
        isOpen={dirtyGuard.showUnsavedDialog}
        pendingUid={dirtyGuard.pendingUid}
        onConfirm={dirtyGuard.confirmDiscard}
        onCancel={dirtyGuard.cancelDiscard}
      />

      {/* Alerta accesible ante intento de acceso con consentimiento REVOCADO (RF-70 / HTTP 403) */}
      <AlertDialog
        open={revocationAlert.isOpen}
        onOpenChange={(open) => !open && setRevocationAlert({ isOpen: false, message: '' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acceso Revocado</AlertDialogTitle>
            <AlertDialogDescription>
              {revocationAlert.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setRevocationAlert({ isOpen: false, message: '' })}
            >
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DirtyGuardContext.Provider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
