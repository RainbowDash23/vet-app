import React, { useState, useEffect, useCallback } from 'react';
import type { PetResponseDto } from '@vet-app/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
} from '../ui';
import { TagIcon, CheckIcon, PlusIcon } from '../ui/icons';
import { petsService as defaultPetsService, PetsService } from '../../services/pets.service';
import { formatPetAge } from '../../utils/pet-age';
import { ApiError } from '../../services/api.client';
import styles from './tag-assignment-modal.module.css';

/**
 * Propiedades del diálogo modal de vinculación asistida de tags NFC no registrados (RF-29, RF-30, RF-31).
 */
export interface TagAssignmentModalProps {
  /**
   * Determina si el diálogo modal se encuentra abierto.
   */
  isOpen: boolean;
  /**
   * Identificador físico hexadecimal (UID) detectado por el lector NFC (RF-29).
   */
  uid: string;
  /**
   * Callback invocado para cerrar el modal o cancelar la operación.
   */
  onClose: () => void;
  /**
   * Callback invocado tras la asignación exitosa del tag en el backend (RF-30).
   */
  onAssignSuccess?: (data: any) => void;
  /**
   * Callback invocado para navegar hacia el formulario de registro de nueva mascota (RF-29, RF-30).
   */
  onNavigateToNewPet?: (uid: string) => void;
  /**
   * Instancia del servicio de mascotas y tags (opcional para inyección de dependencias en pruebas).
   */
  petsService?: PetsService | any;
  /**
   * Lista inicial de mascotas pre-cargadas para pruebas o SSR.
   */
  initialPets?: PetResponseDto[];
  /**
   * Mensaje de error inicial para pruebas o SSR.
   */
  initialError?: string | null;
  /**
   * ID de la mascota inicialmente seleccionada.
   */
  initialSelectedPetId?: string | null;
}

/**
 * Diálogo modal asistido para la vinculación de tags NFC no registrados (T34 / RF-29, RF-30, RF-31).
 *
 * Desplegado de forma inmediata cuando GET /tags/resolve/:uid retorna HTTP 404 ({ registered: false, uid }).
 * Ofrece dos alternativas operativas:
 * - Opción A: Búsqueda y vinculación a una mascota existente enviando POST /tags/assign.
 * - Opción B: Alta asistida de nueva mascota precargando el UID físico.
 *
 * Construido con semántica WAI-ARIA (Radix Dialog) y estilizado exclusivamente mediante
 * CSS Modules y variables CSS nativas sin Tailwind ni dependencias de shadcn (RNF-3).
 */
export const TagAssignmentModal: React.FC<TagAssignmentModalProps> = ({
  isOpen,
  uid,
  onClose,
  onAssignSuccess,
  onNavigateToNewPet,
  petsService = defaultPetsService,
  initialPets = [],
  initialError = null,
  initialSelectedPetId = null,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pets, setPets] = useState<PetResponseDto[]>(initialPets);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(initialSelectedPetId);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  // Sincronizar initialPets si cambian desde props
  useEffect(() => {
    if (initialPets.length > 0) {
      setPets(initialPets);
    }
  }, [initialPets]);

  // Sincronizar initialError si cambia desde props
  useEffect(() => {
    if (initialError !== undefined) {
      setErrorMessage(initialError);
    }
  }, [initialError]);

  // Sincronizar initialSelectedPetId si cambia desde props
  useEffect(() => {
    if (initialSelectedPetId !== undefined) {
      setSelectedPetId(initialSelectedPetId);
    }
  }, [initialSelectedPetId]);

  /**
   * Ejecuta la búsqueda de mascotas activas en el padrón centralizado.
   */
  const handleSearch = useCallback(async () => {
    if (!petsService) return;
    setIsSearching(true);
    setErrorMessage(null);
    try {
      const searchFn = petsService.searchPets
        ? petsService.searchPets.bind(petsService)
        : petsService.getPets
          ? (q: string) => petsService.getPets({ query: q })
          : null;

      if (searchFn) {
        const response = await searchFn(searchQuery);
        setPets(response?.data || []);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error al buscar mascotas en el sistema'
      );
    } finally {
      setIsSearching(false);
    }
  }, [petsService, searchQuery]);

  /**
   * Ejecuta la vinculación del UID actual a la mascota seleccionada (RF-30).
   * Captura HTTP 409 Conflict y presenta alerta accesible si ya existe tag activo (RF-31).
   */
  const handleAssign = useCallback(async () => {
    if (!selectedPetId) {
      setErrorMessage('Debe seleccionar una mascota antes de vincular el tag.');
      return;
    }

    setIsAssigning(true);
    setErrorMessage(null);

    try {
      const response = await petsService.assignTag({
        uid: uid.trim(),
        petId: selectedPetId,
      });

      if (onAssignSuccess) {
        onAssignSuccess(response);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const conflictMsg =
          typeof err.data === 'object' && err.data !== null && 'message' in err.data
            ? String((err.data as Record<string, unknown>).message)
            : err.message;
        setErrorMessage(
          conflictMsg ||
            'Conflicto (HTTP 409): El UID o la mascota ya posee un tag activo (RF-31).'
        );
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Error inesperado al intentar vincular el tag.');
      }
    } finally {
      setIsAssigning(false);
    }
  }, [petsService, selectedPetId, uid, onAssignSuccess, onClose]);

  /**
   * Inicia el flujo de creación de nueva mascota con el UID precargado (RF-29, RF-30).
   */
  const handleNewPet = useCallback(() => {
    if (onNavigateToNewPet) {
      onNavigateToNewPet(uid.trim());
    }
  }, [onNavigateToNewPet, uid]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.modalContent}>
        <DialogHeader className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.iconBadge} aria-hidden="true">
              <TagIcon size={18} />
            </div>
            <div>
              <DialogTitle className={styles.title}>
                Vinculación de Tag NFC
              </DialogTitle>
              <DialogDescription className={styles.description}>
                El transpondedor físico detectado no se encuentra registrado en el sistema clínico.
                Seleccione una mascota existente o cree un nuevo paciente para vincular el identificador.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Presentación destacada del UID físico capturado (RF-29) */}
        <div className={styles.uidBanner}>
          <span className={styles.uidLabel}>Transpondedor NFC</span>
          <span className={styles.uidBadge}>
            UID: <strong>{uid}</strong>
          </span>
        </div>

        {/* Retroalimentación visual accesible ante conflicto de duplicidad (RF-31) */}
        {errorMessage && (
          <div className={styles.errorAlert} role="alert">
            <svg
              className={styles.errorIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className={styles.errorText}>{errorMessage}</p>
          </div>
        )}

        {/* Opción A: Búsqueda y vinculación a mascota existente (RF-30) */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              Opción A: Vincular a Mascota Existente
            </h3>
          </div>

          <div className={styles.searchBar}>
            <div className={styles.searchInputWrapper}>
              <Input
                id="search-pet-query"
                label="Buscar por nombre de mascota o dueño"
                placeholder="Ej. Firulais, 0912345678, Carlos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSearch}
              isLoading={isSearching}
              style={{ marginTop: '1.5rem' }}
            >
              Buscar
            </Button>
          </div>

          {/* Listado de mascotas encontradas */}
          {pets.length > 0 ? (
            <div
              className={styles.petList}
              role="listbox"
              aria-label="Resultados de búsqueda de mascotas"
            >
              {pets.map((pet) => {
                const isSelected = pet.id === selectedPetId;
                const ownerName = pet.owner
                  ? `${pet.owner.name} ${pet.owner.lastName}`.trim()
                  : 'Sin dueño';
                return (
                  <button
                    key={pet.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.petCard} ${
                      isSelected ? styles.petCardSelected : ''
                    }`}
                    onClick={() => {
                      setSelectedPetId(pet.id);
                      setErrorMessage(null);
                    }}
                  >
                    <div className={styles.petInfo}>
                      <div className={styles.petNameRow}>
                        <span className={styles.petName}>{pet.name}</span>
                        <span className={styles.petBreed}>
                          ({pet.species} · {pet.breed || 'Mestizo'})
                        </span>
                      </div>
                      <span className={styles.ownerInfo}>
                        Dueño: {ownerName} · {formatPetAge(pet.birthDate, pet.isApproximateBirthDate)}
                        {pet.owner?.phone ? ` · Tel: ${pet.owner.phone}` : ''}
                      </span>
                    </div>
                    {isSelected && (
                      <span className={styles.selectedBadge}>
                        <CheckIcon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                        Seleccionada
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyResults}>
              {searchQuery
                ? 'No se encontraron mascotas con el criterio especificado.'
                : 'Ingrese un término de búsqueda para localizar a la mascota.'}
            </div>
          )}
        </div>

        {/* Separador entre opciones */}
        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerText}>o bien</span>
          <div className={styles.dividerLine} />
        </div>

        {/* Opción B: Registrar nueva mascota con UID precargado (RF-29, RF-30) */}
        <div className={styles.optionB}>
          <p className={styles.optionBText}>
            ¿Es un paciente nuevo en la clínica? Registre una nueva mascota precargando
            este UID físico directamente en su ficha.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={handleNewPet}
          >
            <PlusIcon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
            Registrar Nueva Mascota con este UID
          </Button>
        </div>

        {/* Pie de diálogo con acciones accesibles */}
        <DialogFooter className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isAssigning}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!selectedPetId || isAssigning}
            isLoading={isAssigning}
            onClick={handleAssign}
          >
            Vincular Tag a Mascota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
