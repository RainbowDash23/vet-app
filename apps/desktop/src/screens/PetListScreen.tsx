import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PetSpecies } from '@vet-app/shared-types';
import type { PetResponseDto } from '@vet-app/shared-types';
import { PetsService, petsService as defaultPetsService } from '../services/pets.service';
import { SearchIcon, ClipboardIcon, WarningIcon, PetIcon } from '../components/ui/icons';
import { Button } from '../components/ui';
import styles from './PetListScreen.module.css';

export interface PetListScreenProps {
  petsServiceInstance?: PetsService;
  onSelectPet?: (petId: string) => void;
  onRegisterNewPet?: () => void;
  initialPets?: PetResponseDto[];
}

export const PetListScreen: React.FC<PetListScreenProps> = ({
  petsServiceInstance = defaultPetsService,
  onSelectPet,
  onRegisterNewPet,
  initialPets,
}) => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const limit = 10;

  const [pets, setPets] = useState<PetResponseDto[]>(initialPets || []);
  const [total, setTotal] = useState<number>(initialPets?.length || 0);
  const [totalPages, setTotalPages] = useState<number>(
    initialPets ? Math.max(1, Math.ceil(initialPets.length / limit)) : 1
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialPets);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debounce del término de búsqueda (300 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPets = useCallback(
    async (isCancelled?: () => boolean) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await petsServiceInstance.getPets({
        query: debouncedQuery || undefined,
        page,
        limit,
      });
      if (!isMountedRef.current || (isCancelled && isCancelled())) {
        return;
      }
      setPets(res.data || []);
      const totalCount = res.meta?.total ?? res.data?.length ?? 0;
      const pagesCount = res.meta?.totalPages ?? Math.max(1, Math.ceil(totalCount / limit));
      setTotal(totalCount);
      setTotalPages(pagesCount);
    } catch (err: unknown) {
      if (!isMountedRef.current || (isCancelled && isCancelled())) {
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : 'Error al cargar el listado de pacientes'
      );
    } finally {
      if (isMountedRef.current && !(isCancelled && isCancelled())) {
        setIsLoading(false);
      }
    }
  }, [petsServiceInstance, debouncedQuery, page, limit]);

  useEffect(() => {
    // Si se inyectaron initialPets y no hay búsqueda activa, no refetchear inmediatamente en mount
    if (initialPets && !debouncedQuery && page === 1) {
      return;
    }
    let cancelled = false;
    void fetchPets(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchPets, initialPets, debouncedQuery, page]);

  const getSpeciesLabel = (species: PetSpecies | string): string => {
    switch (species) {
      case PetSpecies.CANINE:
      case 'CANINE':
        return 'Canino';
      case PetSpecies.FELINE:
      case 'FELINE':
        return 'Felino';
      case PetSpecies.AVIAN:
      case 'AVIAN':
        return 'Ave';
      case PetSpecies.EQUINE:
      case 'EQUINE':
        return 'Equino';
      default:
        return 'Otro';
    }
  };

  const getActiveTagUid = (pet: PetResponseDto): string | null => {
    const activeTag = pet.tags?.find((t) => t.status === 'ACTIVE');
    return activeTag?.uid || null;
  };

  return (
    <div className={styles.container} role="main">
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Lista de Pacientes</h1>
          <p className={styles.subtitle}>
            Pacientes asignados a la clínica activa y padrón de atención médica
          </p>
        </div>
        {onRegisterNewPet && (
          <Button variant="primary" onClick={onRegisterNewPet}>
            Registrar Mascota
          </Button>
        )}
      </div>

      {/* Barra de Búsqueda */}
      <div className={styles.searchBar}>
        <div className={styles.searchInputWrapper}>
          <SearchIcon size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar por nombre de mascota, dueño o cédula..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar pacientes por nombre de mascota, dueño o cédula"
          />
        </div>
        {searchInput && (
          <button
            type="button"
            className={styles.clearSearchButton}
            onClick={() => setSearchInput('')}
            aria-label="Limpiar búsqueda"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Estado de Error */}
      {errorMessage && (
        <div role="alert" className={styles.errorBanner}>
          <WarningIcon size={18} aria-hidden="true" />
          <span>{errorMessage}</span>
          <Button variant="outline" size="sm" onClick={() => void fetchPets()}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Estado de Carga */}
      {isLoading && (
        <div role="status" aria-live="polite" className={styles.loadingWrapper}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Cargando pacientes...</span>
        </div>
      )}

      {/* Estado Vacío */}
      {!isLoading && !errorMessage && pets.length === 0 && (
        <div className={styles.emptyState} role="region" aria-label="Sin resultados">
          <span className={styles.emptyIcon} aria-hidden="true">
            <ClipboardIcon size={36} />
          </span>
          <h2 className={styles.emptyTitle}>No se encontraron pacientes</h2>
          <p className={styles.emptyText}>
            {debouncedQuery
              ? `No existen coincidencias para el término "${debouncedQuery}". Intente con otro nombre o documento.`
              : 'La clínica actual no tiene pacientes en su lista aún. Registre una nueva mascota o escanee un llavero para añadirla.'}
          </p>
          {onRegisterNewPet && !debouncedQuery && (
            <Button variant="primary" onClick={onRegisterNewPet}>
              Registrar Primera Mascota
            </Button>
          )}
        </div>
      )}

      {/* Tabla de Pacientes */}
      {!isLoading && !errorMessage && pets.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.petsTable} aria-label="Tabla de pacientes de la clínica">
            <thead>
              <tr>
                <th scope="col">Mascota</th>
                <th scope="col">Propietario</th>
                <th scope="col">Contacto</th>
                <th scope="col">Llavero NFC</th>
                <th scope="col">Fecha Registro</th>
                <th scope="col" className={styles.colActions}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pets.map((pet) => {
                const tagUid = getActiveTagUid(pet);
                const ownerFullName = pet.owner
                  ? `${pet.owner.name} ${pet.owner.lastName || ''}`.trim()
                  : 'Sin propietario';

                return (
                  <tr
                    key={pet.id}
                    className={styles.tableRow}
                    onClick={() => onSelectPet?.(pet.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPet?.(pet.id);
                      }
                    }}
                    role="button"
                    aria-label={`Ver ficha de ${pet.name}`}
                  >
                    <td>
                      <div className={styles.petCell}>
                        <div className={styles.petAvatar} aria-hidden="true">
                          <PetIcon size={18} />
                        </div>
                        <div>
                          <span className={styles.petName}>{pet.name}</span>
                          <span className={styles.petDetails}>
                            {getSpeciesLabel(pet.species)} • {pet.breed || 'Mestizo'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.ownerCell}>
                        <span className={styles.ownerName}>{ownerFullName}</span>
                        {pet.owner?.documentId && (
                          <span className={styles.ownerDoc}>Doc: {pet.owner.documentId}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={styles.phoneText}>
                        {pet.owner?.phone || 'Sin teléfono'}
                      </span>
                    </td>
                    <td>
                      {tagUid ? (
                        <span className={styles.tagBadge}>UID: {tagUid}</span>
                      ) : (
                        <span className={styles.noTagBadge}>Sin tag</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.dateText}>
                        {new Date(pet.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className={styles.colActions}>
                      <button
                        type="button"
                        className={styles.viewButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPet?.(pet.id);
                        }}
                      >
                        Ver Ficha
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de Paginación */}
      {!isLoading && !errorMessage && total > 0 && (
        <div className={styles.paginationBar} aria-label="Controles de paginación">
          <span className={styles.paginationInfo}>
            Página {page} de {totalPages} ({total} paciente{total === 1 ? '' : 's'})
          </span>
          <div className={styles.paginationButtons}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
