import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { AuthContext } from '../context/auth.context';
import {
  PetSpecies,
  PetSex,
  TagStatus,
} from '@vet-app/shared-types';
import type {
  PetResponseDto,
  PetMinimalFiliationDto,
  ResolveTagSuccessDto,
  ResolveTagUnregisteredDto,
  VisitResponseDto,
} from '@vet-app/shared-types';

import { PetsService, petsService as defaultPetsService, type VaccinationRecord } from '../services/pets.service';
import { useNfcReader } from '../hooks/use-nfc-reader';
import { useSafeDirtyGuard, type DirtyGuardState } from '../hooks/use-form-dirty-guard';
import { Button } from '../components/ui';
import { formatPetAge } from '../utils/pet-age';
import {
  PetIcon,
  TagIcon,
  WarningIcon,
  CheckIcon,
  LockIcon,
  RadioIcon,
  ScaleIcon,
  ThermometerIcon,
  HeartIcon,
  LungsIcon,
  TimerIcon,
} from '../components/ui/icons';
import { TagAssignmentModal } from '../components/screens/tag-assignment-modal';
import styles from './patient-file-screen.module.css';

export interface PatientFileScreenProps {
  /**
   * UID del tag NFC a resolver al montar la pantalla.
   */
  uid?: string;
  /**
   * ID de la mascota si se accede directamente por navegación interna.
   */
  petId?: string;
  /**
   * ID de la clínica en sesión activa (para control de acceso a datos de emergencia).
   */
  currentClinicId?: string;
  /**
   * Callback invocado cuando se escanea un tag no registrado en el sistema (RF-29).
   */
  onUnregisteredTag?: (uid: string) => void;
  /**
   * Callback para regresar a la pantalla anterior.
   */
  onBack?: () => void;
  /**
   * Inyección del servicio de datos (útil para pruebas unitarias).
   */
  petsService?: PetsService;
  /**
   * Guardia de navegación para intercepción de cambios no guardados (RF-33).
   */
  dirtyGuard?: DirtyGuardState;
  /**
   * Datos iniciales precargados para evitar peticiones redundantes.
   */
  initialData?: ResolveTagSuccessDto;
  /**
   * Estado inicial de tag no registrado.
   */
  initialUnregistered?: ResolveTagUnregisteredDto;
  /**
   * Lista de visitas precargadas.
   */
  initialVisits?: VisitResponseDto[];
  /**
   * Lista de vacunaciones precargadas.
   */
  initialVaccinations?: VaccinationRecord[];
  /**
   * Pestaña inicial seleccionada ('summary' | 'history' | 'vaccines').
   */
  initialTab?: TabType;
  /**
   * Habilitar o deshabilitar la escucha reactiva automática NFC (por defecto true).
   */
  autoListenNfc?: boolean;
}

type TabType = 'summary' | 'history' | 'vaccines';

/**
 * Pantalla de Ficha Clínica de Paciente (T33 / RF-21, RF-23, RF-28, RF-47, RF-48, RNF-5).
 * Se activa reactivamente ante el escaneo de llaveros NFC o consulta por ID.
 */
export const PatientFileScreen: React.FC<PatientFileScreenProps> = ({
  uid,
  petId,
  currentClinicId,
  onUnregisteredTag,
  onBack,
  petsService = defaultPetsService,
  dirtyGuard: propsDirtyGuard,
  initialData,
  initialUnregistered,
  initialVisits,
  initialVaccinations,
  initialTab = 'summary',
  autoListenNfc = true,
}) => {
  const safeDirtyGuard = useSafeDirtyGuard();
  const effectiveDirtyGuard = propsDirtyGuard ?? safeDirtyGuard;

  // Estado principal de la ficha
  const [data, setData] = useState<ResolveTagSuccessDto | null>(initialData ?? null);
  const [unregistered, setUnregistered] = useState<ResolveTagUnregisteredDto | null>(
    initialUnregistered ?? null
  );
  const [visits, setVisits] = useState<VisitResponseDto[]>(initialVisits ?? []);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>(
    initialVaccinations ?? []
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolutionTimeMs, setResolutionTimeMs] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [publicCode, setPublicCode] = useState<string | null>(initialData?.publicCode || null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const authContext = useContext(AuthContext);
  const effectiveClinicId = currentClinicId ?? authContext?.clinicId ?? authContext?.user?.clinicId;
  const resolvedPet = data?.pet as PetResponseDto | undefined;
  const petOriginClinicId = resolvedPet?.createdByClinicId;
  const isOriginClinic = Boolean(
    effectiveClinicId && petOriginClinicId && effectiveClinicId === petOriginClinicId
  );

  useEffect(() => {
    let isMounted = true;
    if (data?.publicCode) {
      setPublicCode(data.publicCode);
      return;
    }
    const targetPetId = (data?.pet as PetResponseDto)?.id || petId;
    if (isOriginClinic && targetPetId) {
      petsService
        .getTagsByPet(targetPetId)
        .then((tagsList) => {
          if (isMounted && tagsList && tagsList.length > 0) {
            const activeTag = tagsList.find((t) => t.status === 'ACTIVE') || tagsList[0];
            if (activeTag?.publicCode) {
              setPublicCode(activeTag.publicCode);
            }
          }
        })
        .catch(() => {});
    } else {
      setPublicCode(null);
    }
    return () => {
      isMounted = false;
    };
  }, [data?.publicCode, data?.pet, petId, isOriginClinic, petsService]);

  const publicBaseUrl = (
    (typeof process !== 'undefined' && process.env?.VITE_PUBLIC_URL) ||
    import.meta.env?.VITE_PUBLIC_URL ||
    'http://localhost:3000/p'
  ).replace(/\/+$/, '');
  const emergencyUrl = publicCode ? `${publicBaseUrl}/${publicCode}` : null;

  const handleCopyEmergencyLink = async () => {
    if (!emergencyUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(emergencyUrl);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const onUnregisteredTagRef = useRef(onUnregisteredTag);
  onUnregisteredTagRef.current = onUnregisteredTag;

  /**
   * Resuelve y carga la información médica asociada a un UID físico de tag NFC (RF-28).
   * Mide el tiempo de resolución para auditoría de rendimiento (<600 ms, RNF-5).
   */
  const resolveAndLoad = useCallback(
    async (targetUid: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      const startTime = performance.now();

      try {
        const result = await petsService.resolveTag(targetUid);

        if (!result.registered) {
          setData(null);
          setUnregistered(result);
          setVisits([]);
          setVaccinations([]);
          const elapsed = Math.round(performance.now() - startTime);
          setResolutionTimeMs(elapsed);
          if (onUnregisteredTagRef.current) {
            onUnregisteredTagRef.current(result.uid);
          }
          return;
        }

        setUnregistered(null);
        setData(result);

        // Si cuenta con acceso completo (RF-23), cargar visitas y vacunas concurrentemente
        if (result.hasFullAccess) {
          const resolvedPetId = (result.pet as PetResponseDto).id;
          if (resolvedPetId) {
            const [historyRes, vacsRes] = await Promise.all([
              petsService.getMedicalHistory(resolvedPetId).catch(() => ({ data: [] })),
              petsService.getVaccinations(resolvedPetId).catch(() => ({ data: [] })),
            ]);
            setVisits(historyRes.data || []);
            setVaccinations(vacsRes.data || []);
          }
        } else {
          setVisits([]);
          setVaccinations([]);
        }

        const elapsed = Math.round(performance.now() - startTime);
        setResolutionTimeMs(elapsed);
      } catch (err) {
        console.error('[PatientFileScreen] Error resolviendo tag:', err);
        setErrorMessage(
          err instanceof Error ? err.message : 'Error al consultar la ficha del paciente'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [petsService]
  );

  /**
   * Carga directa por identificador de mascota (cuando no proviene de lectura NFC directa).
   */
  const loadByPetId = useCallback(
    async (targetPetId: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      const startTime = performance.now();

      try {
        const pet = await petsService.getPetById(targetPetId);
        const [historyRes, vacsRes] = await Promise.all([
          petsService.getMedicalHistory(targetPetId).catch(() => ({ data: [] })),
          petsService.getVaccinations(targetPetId).catch(() => ({ data: [] })),
        ]);

        setData({
          registered: true,
          uid: 'MANUAL_LOOKUP',
          pet,
          hasFullAccess: true,
        });
        setUnregistered(null);
        setVisits(historyRes.data || []);
        setVaccinations(vacsRes.data || []);

        const elapsed = Math.round(performance.now() - startTime);
        setResolutionTimeMs(elapsed);
      } catch (err) {
        console.error('[PatientFileScreen] Error cargando mascota:', err);
        setErrorMessage(
          err instanceof Error ? err.message : 'Error al cargar los datos de la mascota'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [petsService]
  );

  // Escucha reactiva continua de transpondedores NFC (RF-27, RF-33)
  useNfcReader({
    enabled: autoListenNfc,
    onTagDetected: (scannedUid) => {
      if (effectiveDirtyGuard && effectiveDirtyGuard.isDirty) {
        effectiveDirtyGuard.handleTagDetected(scannedUid);
        return;
      }
      resolveAndLoad(scannedUid);
    },
  });

  // Carga inicial ante parámetros de entrada
  useEffect(() => {
    if (initialData || initialUnregistered) {
      return;
    }
    if (uid) {
      resolveAndLoad(uid);
    } else if (petId) {
      loadByPetId(petId);
    }
  }, [uid, petId, initialData, initialUnregistered, resolveAndLoad, loadByPetId]);

  // Funciones auxiliares de formateo seguro
  const getSpeciesLabel = (species: PetSpecies): string => {
    switch (species) {
      case PetSpecies.CANINE:
        return 'Canino (Perro)';
      case PetSpecies.FELINE:
        return 'Felino (Gato)';
      case PetSpecies.AVIAN:
        return 'Ave';
      case PetSpecies.EQUINE:
        return 'Equino';
      case PetSpecies.OTHER:
      default:
        return 'Otra especie';
    }
  };

  const getSpeciesAvatar = (_species: PetSpecies): React.ReactNode => {
    return <PetIcon size={24} />;
  };

  const getSexLabel = (sex: PetSex): string => {
    switch (sex) {
      case PetSex.MALE:
        return 'Macho';
      case PetSex.FEMALE:
        return 'Hembra';
      case PetSex.UNKNOWN:
      default:
        return 'Desconocido';
    }
  };

  // 1. Estado de Carga
  if (isLoading && !data && !unregistered) {
    return (
      <div className={styles.container} role="main">
        <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.spinner} />
          <h2 className={styles.stateTitle}>Resolviendo Ficha Clínica...</h2>
          <p className={styles.stateDescription}>
            Procesando identificación del transpondedor NFC y verificando consentimientos de acceso.
          </p>
        </div>
      </div>
    );
  }

  // 2. Estado de Error
  if (errorMessage && !data && !unregistered) {
    return (
      <div className={styles.container} role="main">
        <div className={styles.errorState} role="alert">
          <span className={styles.stateIcon}>
            <WarningIcon size={32} />
          </span>
          <h2 className={styles.stateTitle}>No se pudo cargar la ficha</h2>
          <p className={styles.stateDescription}>{errorMessage}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                Volver
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => (uid ? resolveAndLoad(uid) : petId ? loadByPetId(petId) : undefined)}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Estado de Tag No Registrado (RF-29)
  if (unregistered) {
    return (
      <div className={styles.container} role="main">
        <div className={styles.topBar}>
          {onBack && (
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              aria-label="Volver"
            >
              ← Volver
            </button>
          )}
        </div>

        <div className={styles.emptyState} role="region" aria-labelledby="unregistered-title">
          <span className={styles.stateIcon}>
            <TagIcon size={32} />
          </span>
          <h2 id="unregistered-title" className={styles.stateTitle}>
            Tag NFC No Registrado
          </h2>
          <div className={styles.tagUidDisplay}>UID: {unregistered.uid}</div>
          <p className={styles.stateDescription}>
            El transpondedor físico detectado no se encuentra asignado a ningún paciente activo en
            la base de datos clínica.
          </p>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Button
              variant="primary"
              onClick={() => {
                if (onUnregisteredTagRef.current) {
                  onUnregisteredTagRef.current(unregistered.uid);
                }
                setShowAssignModal(true);
              }}
            >
              Vincular Tag a Mascota
            </Button>
          </div>
          <TagAssignmentModal
            isOpen={showAssignModal}
            uid={unregistered.uid}
            petsService={petsService}
            onClose={() => setShowAssignModal(false)}
            onAssignSuccess={() => {
              setShowAssignModal(false);
              resolveAndLoad(unregistered.uid);
            }}
          />
        </div>
      </div>
    );
  }

  // 4. Estado de Espera (Sin tag ni mascota seleccionada)
  if (!data) {
    return (
      <div className={styles.container} role="main">
        <div className={styles.topBar}>
          {onBack && (
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              aria-label="Volver"
            >
              ← Volver
            </button>
          )}
        </div>

        <div className={styles.emptyState}>
          <span className={styles.stateIcon}>
            <RadioIcon size={32} />
          </span>
          <h2 className={styles.stateTitle}>Esperando lectura NFC</h2>
          <p className={styles.stateDescription}>
            Aproxime el llavero o tarjeta NFC del paciente al lector para desplegar de forma
            inmediata su expediente médico completo en menos de 600 ms.
          </p>
        </div>
      </div>
    );
  }

  // Extracción tipada según nivel de consentimiento
  const pet = data.pet;
  const isFullAccess = data.hasFullAccess;
  const fullPet = isFullAccess ? (pet as PetResponseDto) : null;
  const minimalPet = !isFullAccess ? (pet as PetMinimalFiliationDto) : null;

  const ownerPhone = fullPet ? fullPet.owner?.phone : minimalPet?.ownerPhone;
  const ownerName = fullPet?.owner
    ? `${fullPet.owner.name} ${fullPet.owner.lastName || ''}`.trim()
    : minimalPet?.ownerName;
  const breed = pet.breed || 'Sin raza definida / Mestizo';
  const tagStatus = minimalPet?.tagStatus ?? TagStatus.ACTIVE;

  // Extracción de constantes vitales más recientes
  const latestVisitWithVitals = visits.find(
    (v) =>
      v.weight !== null &&
      v.weight !== undefined ||
      v.temperature !== null &&
      v.temperature !== undefined ||
      v.heartRate !== null &&
      v.heartRate !== undefined
  );

  return (
    <div className={styles.container} role="main">
      {/* Barra de Acciones y Latencia */}
      <div className={styles.topBar}>
        {onBack && (
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            aria-label="Volver"
          >
            ← Volver
          </button>
        )}

        {resolutionTimeMs !== null && (
          <div
            className={styles.latencyBadge}
            role="status"
            aria-label={`Tiempo de resolución: ${resolutionTimeMs} ms`}
          >
            <span className={styles.latencyDot} />
            <span>Resolución: {resolutionTimeMs} ms</span>
            {resolutionTimeMs < 600 && (
              <span className={styles.benchmarkPass}>(&lt; 600 ms RNF-5)</span>
            )}
          </div>
        )}
      </div>

      {/* Cabecera Principal de Identidad */}
      <section className={styles.headerCard} aria-labelledby="pet-title">
        <div className={styles.headerMain}>
          <div className={styles.petIdentity}>
            <div className={styles.speciesAvatar} aria-hidden="true">
              {getSpeciesAvatar(pet.species)}
            </div>
            <div>
              <h1 id="pet-title" className={styles.petName}>
                {pet.name}
              </h1>
              <p className={styles.petSub}>
                {getSpeciesLabel(pet.species)} • {breed} • {getSexLabel(pet.sex)}
              </p>
            </div>
          </div>

          <div className={styles.badgesGroup}>
            <span className={styles.tagBadge}>UID: {data.uid}</span>
            {isFullAccess ? (
              <span className={styles.grantBadgeFull}>
                <CheckIcon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                Acceso Completo (NFC Tap)
              </span>
            ) : (
              <span className={styles.grantBadgeRestricted}>
                <WarningIcon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                Consentimiento Restringido (RF-21)
              </span>
            )}
          </div>
        </div>

        {/* Grilla de Datos de Filiación */}
        <div className={styles.filiationGrid}>
          <div className={styles.dataItem}>
            <span className={styles.dataLabel}>Propietario</span>
            <span className={styles.dataValue}>{ownerName || 'No especificado'}</span>
          </div>
          <div className={styles.dataItem}>
            <span className={styles.dataLabel}>Teléfono de Contacto</span>
            <span className={styles.dataValue}>{ownerPhone || 'Sin teléfono registrado'}</span>
          </div>
          <div className={styles.dataItem}>
            <span className={styles.dataLabel}>Estado del Tag</span>
            <span className={styles.dataValue}>{tagStatus}</span>
          </div>
          {fullPet?.color && (
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Color / Capa</span>
              <span className={styles.dataValue}>{fullPet.color}</span>
            </div>
          )}
          <div className={styles.dataItem}>
            <span className={styles.dataLabel}>Edad</span>
            <span className={styles.dataValue}>
              {formatPetAge(fullPet?.birthDate, fullPet?.isApproximateBirthDate)}
            </span>
          </div>
          {fullPet?.birthDate && (
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Nacimiento</span>
              <span className={styles.dataValue}>
                {new Date(fullPet.birthDate).toLocaleDateString()}{fullPet.isApproximateBirthDate ? ' (Aprox.)' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Sección de Emergencia y Código Público del Llavero (RF-70, Problem D) */}
        {isOriginClinic && publicCode && (
          <div className={styles.emergencyCard} data-testid="emergency-tag-card">
            <div className={styles.emergencyCardHeader}>
              <span className={styles.emergencyCardTitle}>Identificador Público y Enlace de Emergencia</span>
              <span className={styles.emergencyBadge}>Llavero Activo</span>
            </div>
            <p className={styles.emergencyDescription}>
              Enlace de rescate público accesible mediante QR o navegador en caso de extravío.
              Solo muestra datos de contacto de emergencia, protegiendo el historial médico.
            </p>
            <div className={styles.emergencyRow}>
              <div className={styles.emergencyField}>
                <span className={styles.emergencyLabel}>Código Público:</span>
                <code className={styles.emergencyCode}>{publicCode}</code>
              </div>
              <div className={styles.emergencyField}>
                <span className={styles.emergencyLabel}>URL de Emergencia:</span>
                <span className={styles.emergencyUrl}>{emergencyUrl}</span>
              </div>
              <button
                type="button"
                className={styles.copyButton}
                onClick={handleCopyEmergencyLink}
                aria-label="Copiar enlace de emergencia"
              >
                {copiedLink ? '¡Copiado!' : 'Copiar enlace'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* VISTA SEGÚN CONSENTIMIENTO (RF-21 vs RF-23) */}
      {!isFullAccess ? (
        // Caso A: Consentimiento Restringido a Datos Mínimos de Filiación (RF-21)
        <section
          className={styles.restrictedBanner}
          role="region"
          aria-labelledby="restricted-consent-heading"
        >
          <span className={styles.bannerIcon} aria-hidden="true">
            <LockIcon size={24} />
          </span>
          <div>
            <h2 id="restricted-consent-heading" className={styles.bannerTitle}>
              Acceso restringido: Consentimiento limitado a datos mínimos de filiación (RF-21)
            </h2>
            <p className={styles.bannerText}>
              Esta clínica no posee un consentimiento temporal (AccessGrant) activo originado por
              lectura física NFC para este paciente. Conforme a las normas de confidencialidad y
              protección de datos médicos, el historial clínico, notas de evolución, constantes
              vitales y recetas se encuentran ocultos. Aproxime físicamente el llavero NFC del
              paciente a la estación de trabajo para habilitar el acceso ampliado por 24 horas
              (RF-22, RF-23).
            </p>
          </div>
        </section>
      ) : (
        // Caso B: Consentimiento Ampliado Activo (RF-23)
        <div className={styles.tabPanel} role="region" aria-label="Expediente Clínico Completo">
          {/* Navegación por Pestañas Accesibles WAI-ARIA */}
          <div className={styles.tabList} role="tablist" aria-label="Pestañas de la ficha clínica">
            <button
              type="button"
              role="tab"
              id="tab-summary"
              aria-selected={activeTab === 'summary'}
              aria-controls="panel-summary"
              className={styles.tabTrigger}
              onClick={() => setActiveTab('summary')}
            >
              Resumen y Constantes
            </button>
            <button
              type="button"
              role="tab"
              id="tab-history"
              aria-selected={activeTab === 'history'}
              aria-controls="panel-history"
              className={styles.tabTrigger}
              onClick={() => setActiveTab('history')}
            >
              Historial Clínico ({visits.length})
            </button>
            <button
              type="button"
              role="tab"
              id="tab-vaccines"
              aria-selected={activeTab === 'vaccines'}
              aria-controls="panel-vaccines"
              className={styles.tabTrigger}
              onClick={() => setActiveTab('vaccines')}
            >
              Carnet de Vacunación ({vaccinations.length})
            </button>
          </div>

          {/* Pestaña 1: Resumen y Constantes Vitales Recientes */}
          {activeTab === 'summary' && (
            <div
              id="panel-summary"
              role="tabpanel"
              aria-labelledby="tab-summary"
              className={styles.tabPanel}
            >
              <section className={styles.vitalsSection} aria-labelledby="vitals-heading">
                <h2 id="vitals-heading" className={styles.sectionTitle}>
                  Constantes Vitales Recientes
                </h2>

                <div className={styles.vitalsGrid}>
                  <div className={styles.vitalCard}>
                    <div className={styles.vitalHeader}>
                      <span>Peso</span>
                      <ScaleIcon size={16} />
                    </div>
                    <div className={styles.vitalValue}>
                      {latestVisitWithVitals?.weight ?? '--'}
                      <span className={styles.vitalUnit}>kg</span>
                    </div>
                  </div>

                  <div className={styles.vitalCard}>
                    <div className={styles.vitalHeader}>
                      <span>Temperatura</span>
                      <ThermometerIcon size={16} />
                    </div>
                    <div className={styles.vitalValue}>
                      {latestVisitWithVitals?.temperature ?? '--'}
                      <span className={styles.vitalUnit}>°C</span>
                    </div>
                  </div>

                  <div className={styles.vitalCard}>
                    <div className={styles.vitalHeader}>
                      <span>FC (Frec. Cardíaca)</span>
                      <HeartIcon size={16} />
                    </div>
                    <div className={styles.vitalValue}>
                      {latestVisitWithVitals?.heartRate ?? '--'}
                      <span className={styles.vitalUnit}>lpm</span>
                    </div>
                  </div>

                  <div className={styles.vitalCard}>
                    <div className={styles.vitalHeader}>
                      <span>FR (Frec. Respiratoria)</span>
                      <LungsIcon size={16} />
                    </div>
                    <div className={styles.vitalValue}>
                      {latestVisitWithVitals?.respiratoryRate ?? '--'}
                      <span className={styles.vitalUnit}>rpm</span>
                    </div>
                  </div>

                  <div className={styles.vitalCard}>
                    <div className={styles.vitalHeader}>
                      <span>TLLC (Llenado Capilar)</span>
                      <TimerIcon size={16} />
                    </div>
                    <div className={styles.vitalValue}>
                      {latestVisitWithVitals?.capillaryRefillTime ?? '--'}
                      <span className={styles.vitalUnit}>s</span>
                    </div>
                  </div>
                </div>
              </section>

              {fullPet?.notes && (
                <div className={styles.visitCard}>
                  <h3 className={styles.sectionTitle}>Observaciones Generales</h3>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                    {fullPet.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Pestaña 2: Historial Médico de Consultas y Notas de Evolución (RF-23, RF-47) */}
          {activeTab === 'history' && (
            <div
              id="panel-history"
              role="tabpanel"
              aria-labelledby="tab-history"
              className={styles.tabPanel}
            >
              <h2 className={styles.sectionTitle}>Historial de Atenciones Clínicas</h2>

              {visits.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.stateDescription}>
                    No existen consultas médicas previas registradas para esta mascota.
                  </p>
                </div>
              ) : (
                <div className={styles.historyList}>
                  {visits.map((visit) => (
                    <article key={visit.id} className={styles.visitCard}>
                      <div className={styles.visitCardHeader}>
                        <div>
                          <div className={styles.visitDate}>
                            {new Date(visit.startTime).toLocaleDateString()} •{' '}
                            {new Date(visit.startTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className={styles.visitVet}>
                            Veterinario:{' '}
                            {visit.veterinarian
                              ? `${visit.veterinarian.name} ${visit.veterinarian.lastName || ''}`.trim() || visit.veterinarian.email
                              : 'N/A'}
                          </div>
                        </div>

                        <span
                          className={styles.grantBadgeFull}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {visit.closedAt ? 'Completada' : visit.status}
                        </span>
                      </div>

                      <h3 className={styles.visitReason}>Motivo: {visit.reason}</h3>

                      <div className={styles.visitClinicalDetails}>
                        <div>
                          <div className={styles.clinicalFieldTitle}>Diagnóstico</div>
                          <div className={styles.clinicalFieldValue}>
                            {visit.diagnosis || 'Sin diagnóstico asentado'}
                          </div>
                        </div>
                        <div>
                          <div className={styles.clinicalFieldTitle}>Tratamiento / Indicaciones</div>
                          <div className={styles.clinicalFieldValue}>
                            {visit.treatment || 'Sin tratamiento asignado'}
                          </div>
                        </div>
                      </div>

                      {/* Notas Evolutivas Complementarias Inmutables (RF-46) */}
                      {visit.visitNotes && visit.visitNotes.length > 0 && (
                        <div style={{ marginTop: 'var(--space-2)' }}>
                          <div className={styles.clinicalFieldTitle}>Notas de Evolución</div>
                          <div className={styles.evolutionNotesList}>
                            {visit.visitNotes.map((note) => (
                              <div key={note.id} className={styles.evolutionNoteItem}>
                                <strong>
                                  {note.veterinarian
                                    ? `${note.veterinarian.name} ${note.veterinarian.lastName || ''}`.trim()
                                    : 'Veterinario'}
                                  :
                                </strong>{' '}
                                {note.note}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pestaña 3: Carnet de Vacunación (RF-48) */}
          {activeTab === 'vaccines' && (
            <div
              id="panel-vaccines"
              role="tabpanel"
              aria-labelledby="tab-vaccines"
              className={styles.tabPanel}
            >
              <h2 className={styles.sectionTitle}>Registro Oficial de Vacunación</h2>

              {vaccinations.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.stateDescription}>
                    No hay vacunas registradas en el carnet sanitario de esta mascota.
                  </p>
                </div>
              ) : (
                <div className={styles.vaccinesTableWrapper}>
                  <table className={styles.vaccinesTable} aria-label="Tabla de vacunas aplicadas">
                    <thead>
                      <tr>
                        <th scope="col">Biológico / Vacuna</th>
                        <th scope="col">Lote</th>
                        <th scope="col">Fecha Aplicación</th>
                        <th scope="col">Próximo Refuerzo</th>
                        <th scope="col">Veterinario / Clínica</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaccinations.map((vac) => (
                        <tr key={vac.id}>
                          <td style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                            {vac.vaccineName}
                          </td>
                          <td style={{ fontFamily: 'var(--font-family-mono)' }}>
                            {vac.batchNumber || 'N/A'}
                          </td>
                          <td>{new Date(vac.appliedAt).toLocaleDateString()}</td>
                          <td>
                            {vac.nextDueDate ? (
                              <span className={styles.boosterBadge}>
                                {new Date(vac.nextDueDate).toLocaleDateString()}
                              </span>
                            ) : (
                              'Sin programar'
                            )}
                          </td>
                          <td>{vac.veterinarian?.name || vac.clinic?.name || 'Clínica actuante'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
