import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Role, PetResponseDto, PetSpecies } from '@vet-app/shared-types';
import { Dialog, DialogContent } from '../ui';
import {
  SearchIcon,
  PetIcon,
  ClipboardIcon,
  CalendarIcon,
  UsersIcon,
  StethoscopeIcon,
  SyringeIcon,
  ClinicIcon,
  ShieldIcon,
  UserIcon,
} from '../ui/icons';
import { PetsService, petsService as defaultPetsService } from '../../services/pets.service';
import { ScreenId } from '../layout/sidebar';
import styles from './quick-search-modal.module.css';

export interface QuickActionItem {
  id: string;
  label: string;
  screenId: ScreenId;
  description: string;
  allowedRoles: Array<Role | 'ADMIN' | 'VET' | 'RECEPTION'>;
  icon: React.ReactNode;
}

export const ALL_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'action-pet-register',
    label: 'Registrar Mascota',
    screenId: 'pet-register',
    description: 'Dar de alta un nuevo paciente y asignar llavero NFC',
    allowedRoles: ['ADMIN', 'RECEPTION'],
    icon: <PetIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-owner-register',
    label: 'Registrar Propietario',
    screenId: 'owner-register',
    description: 'Crear ficha de contacto y verificar documento de identidad',
    allowedRoles: ['ADMIN', 'RECEPTION'],
    icon: <UserIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-appointments',
    label: 'Agenda de Visitas',
    screenId: 'appointments',
    description: 'Gestionar citas médicas y disponibilidad de consultorios',
    allowedRoles: ['ADMIN', 'RECEPTION'],
    icon: <CalendarIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-vet-agenda',
    label: 'Agenda de Consultas',
    screenId: 'vet-agenda',
    description: 'Ver turnos asignados del día y consultas pendientes',
    allowedRoles: ['VET'],
    icon: <CalendarIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-care-vaccination',
    label: 'Registro de Atención y Vacunación',
    screenId: 'care-vaccination',
    description: 'Registrar constantes vitales y refuerzos de vacunas',
    allowedRoles: ['VET'],
    icon: <SyringeIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-clinical-record',
    label: 'Ficha Clínica',
    screenId: 'clinical-record',
    description: 'Consultar expediente clínico de pacientes atendidos',
    allowedRoles: ['VET'],
    icon: <StethoscopeIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-pet-list',
    label: 'Lista de Pacientes',
    screenId: 'pet-list',
    description: 'Explorar el padrón de pacientes de la clínica',
    allowedRoles: ['ADMIN', 'VET', 'RECEPTION'],
    icon: <ClipboardIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-users',
    label: 'Gestión de Usuarios y Personal',
    screenId: 'users',
    description: 'Administración de cuentas y roles de acceso (Solo ADMIN)',
    allowedRoles: ['ADMIN'],
    icon: <UsersIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-clinic-management',
    label: 'Gestión de Clínica',
    screenId: 'clinic-management',
    description: 'Parámetros institucionales y datos de sede',
    allowedRoles: ['ADMIN'],
    icon: <ClinicIcon size={16} aria-hidden="true" />,
  },
  {
    id: 'action-audit-logs',
    label: 'Auditoría de Accesos',
    screenId: 'audit-logs',
    description: 'Registro inmutable de trazas y consultas de pacientes',
    allowedRoles: ['ADMIN'],
    icon: <ShieldIcon size={16} aria-hidden="true" />,
  },
];

export interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole?: Role | 'ADMIN' | 'VET' | 'RECEPTION';
  petsServiceInstance?: PetsService;
  onSelectPet: (petId: string) => void;
  onSelectScreen: (screenId: ScreenId) => void;
}

type FlatItem =
  | { type: 'action'; id: string; action: QuickActionItem }
  | { type: 'pet'; id: string; pet: PetResponseDto };

export function formatSpeciesLabel(species?: PetSpecies | string): string {
  switch (species) {
    case 'CANINE':
      return 'Canino';
    case 'FELINE':
      return 'Felino';
    case 'AVIAN':
      return 'Ave';
    case 'EQUINE':
      return 'Equino';
    default:
      return species ?? 'Mascota';
  }
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  currentUserRole = 'RECEPTION',
  petsServiceInstance = defaultPetsService,
  onSelectPet,
  onSelectScreen,
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pets, setPets] = useState<PetResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reiniciar estado cada vez que se abre la paleta
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setPets([]);
      setError(null);
      setSelectedIndex(0);
      setLiveAnnouncement('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Debounce de 250 ms según especificación EARS
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [query]);

  // Acciones rápidas filtradas por el rol del usuario autenticado
  const roleActions = useMemo(() => {
    return ALL_QUICK_ACTIONS.filter((act) =>
      act.allowedRoles.includes(currentUserRole),
    );
  }, [currentUserRole]);

  // Filtrado de acciones por término de búsqueda si el usuario escribe
  const filteredActions = useMemo(() => {
    if (!debouncedQuery) {
      return roleActions;
    }
    const lower = debouncedQuery.toLowerCase();
    return roleActions.filter(
      (act) =>
        act.label.toLowerCase().includes(lower) ||
        act.description.toLowerCase().includes(lower),
    );
  }, [roleActions, debouncedQuery]);

  // Búsqueda de pacientes con GET /pets (debounce 250 ms)
  useEffect(() => {
    if (!debouncedQuery) {
      setPets([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);
    setLiveAnnouncement('Buscando pacientes...');

    petsServiceInstance
      .getPets({ query: debouncedQuery, page: 1, limit: 10 })
      .then((res) => {
        if (!isCurrent || !isMountedRef.current) return;
        const results = res.data ?? [];
        setPets(results);
        setIsLoading(false);
        if (results.length === 0) {
          setLiveAnnouncement(`No se encontraron pacientes para "${debouncedQuery}".`);
        } else {
          setLiveAnnouncement(`${results.length} pacientes encontrados.`);
        }
      })
      .catch((err) => {
        if (!isCurrent || !isMountedRef.current) return;
        setIsLoading(false);
        setError('Error al consultar pacientes. Intente nuevamente.');
        setLiveAnnouncement('Error al consultar pacientes.');
        console.error('Error en búsqueda de pacientes:', err);
      });

    return () => {
      isCurrent = false;
    };
  }, [debouncedQuery, petsServiceInstance]);

  // Lista aplanada para navegación secuencial con flechas arriba/abajo
  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];

    // Si hay búsqueda, mostrar pacientes primero, luego acciones coincidentes
    if (debouncedQuery) {
      pets.forEach((pet) => {
        items.push({ type: 'pet', id: `pet-${pet.id}`, pet });
      });
      filteredActions.forEach((action) => {
        items.push({ type: 'action', id: `action-${action.id}`, action });
      });
    } else {
      // Sin búsqueda: mostrar acciones rápidas disponibles
      roleActions.forEach((action) => {
        items.push({ type: 'action', id: `action-${action.id}`, action });
      });
    }

    return items;
  }, [debouncedQuery, pets, filteredActions, roleActions]);

  // Mantener selectedIndex dentro de los límites válidos
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(flatItems.length > 0 ? 0 : 0);
    }
  }, [flatItems.length, selectedIndex]);

  // Ejecución de elemento seleccionado
  const handleExecuteItem = useCallback(
    (item: FlatItem) => {
      if (item.type === 'action') {
        onSelectScreen(item.action.screenId);
        onClose();
      } else if (item.type === 'pet') {
        onSelectPet(item.pet.id);
        onClose();
      }
    },
    [onSelectScreen, onSelectPet, onClose],
  );

  // Manejador de teclado para navegación accesible con flechas y Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = flatItems[selectedIndex];
      if (current) {
        handleExecuteItem(current);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const selectedItem = flatItems[selectedIndex];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={styles.content}
        data-testid="quick-search-modal"
        aria-describedby={undefined}
      >
        <div className={styles.searchHeader}>
          <SearchIcon className={styles.searchIcon} size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Buscar pacientes o acciones"
            aria-expanded={true}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="quick-search-listbox"
            aria-activedescendant={selectedItem ? selectedItem.id : undefined}
            className={styles.searchInput}
            placeholder="Buscar por mascota, dueño, documento o acción... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="quick-search-input"
          />
          <button
            type="button"
            className={styles.escBadge}
            onClick={onClose}
            aria-label="Cerrar búsqueda rápida"
          >
            Esc
          </button>
        </div>

        {/* Región ARIA en vivo para tecnologías de asistencia */}
        <div aria-live="polite" aria-atomic="true" className={styles.srOnly}>
          {liveAnnouncement}
        </div>

        <div
          ref={listboxRef}
          role="listbox"
          id="quick-search-listbox"
          className={styles.listboxContainer}
          aria-label="Resultados de búsqueda y acciones rápidas"
        >
          {error && (
            <div role="alert" className={styles.errorMessage} data-testid="quick-search-error">
              {error}
            </div>
          )}

          {isLoading && (
            <div className={styles.stateMessage} data-testid="quick-search-loading">
              Buscando pacientes...
            </div>
          )}

          {!isLoading && debouncedQuery && pets.length === 0 && filteredActions.length === 0 && (
            <div className={styles.stateMessage} data-testid="quick-search-empty">
              No se encontraron resultados para &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {/* Sección de Pacientes Encontrados */}
          {pets.length > 0 && (
            <div>
              <div className={styles.sectionTitle}>Pacientes</div>
              {pets.map((pet) => {
                const itemId = `pet-${pet.id}`;
                const itemIndex = flatItems.findIndex((it) => it.id === itemId);
                const isSelected = itemIndex === selectedIndex;
                const extendedOwner = pet.owner as (typeof pet.owner & { fullName?: string });
                const ownerName = pet.owner
                  ? pet.owner.name && pet.owner.lastName
                    ? `${pet.owner.name} ${pet.owner.lastName}`.trim()
                    : extendedOwner?.fullName || pet.owner.name || 'Propietario'
                  : 'Sin dueño';
                const docText = pet.owner?.documentId ? ` • Doc: ${pet.owner.documentId}` : '';
                const tagInfo = pet.tags?.[0];
                const statusLabel = tagInfo
                  ? `Tag ${tagInfo.status}`
                  : pet.isInRoster
                  ? 'En padrón'
                  : 'Registrado';

                return (
                  <div
                    key={pet.id}
                    id={itemId}
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.itemOption} ${
                      isSelected ? styles.itemOptionSelected : ''
                    }`}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    onClick={() => handleExecuteItem({ type: 'pet', id: itemId, pet })}
                    data-testid={`quick-search-pet-${pet.id}`}
                  >
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitleRow}>
                        <span className={styles.petName}>{pet.name}</span>
                        <span className={styles.speciesBadge}>
                          {formatSpeciesLabel(pet.species)}
                        </span>
                      </div>
                      <div className={styles.petSubDetails}>
                        {pet.breed || 'Mestizo'}
                        {pet.sex ? ` • ${pet.sex === 'MALE' ? 'Macho' : 'Hembra'}` : ''}
                      </div>
                      <div className={styles.ownerRow}>
                        Dueño: {ownerName}
                        {docText}
                      </div>
                    </div>
                    <div className={styles.itemBadgeCol}>
                      <span
                        className={tagInfo ? styles.statusTag : styles.statusDefault}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sección de Acciones Rápidas */}
          {(!debouncedQuery || filteredActions.length > 0) && (
            <div>
              <div className={styles.sectionTitle}>
                {debouncedQuery ? 'Acciones Coincidentes' : 'Acciones Rápidas'}
              </div>
              {(debouncedQuery ? filteredActions : roleActions).map((action) => {
                const itemId = `action-${action.id}`;
                const itemIndex = flatItems.findIndex((it) => it.id === itemId);
                const isSelected = itemIndex === selectedIndex;

                return (
                  <div
                    key={action.id}
                    id={itemId}
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.itemOption} ${
                      isSelected ? styles.itemOptionSelected : ''
                    }`}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    onClick={() =>
                      handleExecuteItem({ type: 'action', id: itemId, action })
                    }
                    data-testid={`quick-search-action-${action.id}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={styles.actionIconBox}>{action.icon}</div>
                      <div className={styles.itemMain}>
                        <span className={styles.actionLabel}>{action.label}</span>
                        <span className={styles.actionDesc}>{action.description}</span>
                      </div>
                    </div>
                    {action.allowedRoles.length === 1 &&
                      action.allowedRoles[0] === 'ADMIN' && (
                        <span className={styles.actionBadge}>ADMIN</span>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footerBar}>
          <div className={styles.kbdHelper}>
            <span>Navegar:</span>
            <kbd className={styles.kbd}>↑</kbd>
            <kbd className={styles.kbd}>↓</kbd>
            <span>Seleccionar:</span>
            <kbd className={styles.kbd}>Enter</kbd>
          </div>
          <div className={styles.kbdHelper}>
            <span>Cerrar:</span>
            <kbd className={styles.kbd}>Esc</kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
