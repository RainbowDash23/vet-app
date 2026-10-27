import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { VisitResponseDto, VisitStatus } from '@vet-app/shared-types';
import { visitsService as defaultVisitsService, VisitsService } from '../services/visits.service';
import { NewVisitModal } from '../components/screens/new-visit-modal';
import { CancelVisitDialog } from '../components/screens/cancel-visit-dialog';
import { PlusIcon, CalendarIcon, CheckIcon, CrossIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/ui/icons';
import styles from './schedule-screen.module.css';

const VISIT_STATUS_CANCELLED = 'CANCELLED';
const VISIT_STATUS_SCHEDULED = 'SCHEDULED';

export interface ScheduleScreenProps {
  /**
   * Instancia inyectable del servicio de visitas.
   */
  visitsService?: VisitsService;
  /**
   * Fecha inicial seleccionada en formato YYYY-MM-DD.
   */
  initialDate?: string;
  /**
   * Lista inicial de visitas para renderizado estático o pruebas unitarias.
   */
  initialVisits?: VisitResponseDto[];
  /**
   * Mascotas disponibles para agendamiento.
   */
  availablePets?: Array<{ id: string; name: string }>;
  /**
   * Veterinarios disponibles para agendamiento.
   */
  availableVets?: Array<{ id: string; name: string; licenseNumber?: string }>;
  /**
   * Identificador de la clínica activa.
   */
  clinicId?: string;
}

/**
 * Formatea una fecha ISO a HH:mm
 */
function formatTime(isoString: string | Date): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return String(isoString);
  }
}

/**
 * Pantalla principal de Agenda Médica y Turnos Clínicos (T35 / RF-39, RF-40, RF-41, RF-42).
 * Construida con arquitectura 100% pura en CSS Modules y variables CSS nativas sin Tailwind ni shadcn (RNF-3).
 */
export const ScheduleScreen: React.FC<ScheduleScreenProps> = ({
  visitsService = defaultVisitsService,
  initialDate,
  initialVisits,
  availablePets = [],
  availableVets = [],
  clinicId,
}) => {
  const getTodayString = () => new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || getTodayString(),
  );
  const [visits, setVisits] = useState<VisitResponseDto[]>(initialVisits ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Estados de modales
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [selectedVisitForCancel, setSelectedVisitForCancel] = useState<VisitResponseDto | null>(null);

  // Sincronizar initialVisits si cambian desde props
  useEffect(() => {
    if (initialVisits !== undefined) {
      setVisits(initialVisits);
    }
  }, [initialVisits]);

  // Sincronizar initialDate si cambia desde props
  useEffect(() => {
    if (initialDate !== undefined) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Carga reactiva de visitas de la API
  const fetchVisitsForDate = useCallback(
    async (date: string, isCancelled?: () => boolean) => {
      // Si se proporcionaron initialVisits y no hay cambio de fecha en pruebas, omitir
      if (initialVisits !== undefined && date === initialDate) {
        return;
      }
      setIsLoading(true);
      try {
        const response = await visitsService.getVisits({
          date,
          clinicId,
          limit: 50,
        });
        if (!isMountedRef.current || (isCancelled && isCancelled())) return;
        setVisits(response.data);
      } catch (err) {
        console.error('Error al consultar agenda médica:', err);
      } finally {
        if (isMountedRef.current && !(isCancelled && isCancelled())) {
          setIsLoading(false);
        }
      }
    },
    [visitsService, clinicId, initialVisits, initialDate],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchVisitsForDate(selectedDate, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [selectedDate, fetchVisitsForDate]);

  // Navegación de fechas
  const handlePrevDay = () => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() - 1);
    setSelectedDate(current.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + 1);
    setSelectedDate(current.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(getTodayString());
  };

  // Contadores
  const scheduledCount = visits.filter(
    (v) => (v.status === VISIT_STATUS_SCHEDULED || v.status === ('PENDING' as VisitStatus)) && !v.closedAt,
  ).length;
  const attendedCount = visits.filter((v) => Boolean(v.closedAt)).length;
  const cancelledCount = visits.filter(
    (v) => v.status === VISIT_STATUS_CANCELLED,
  ).length;

  return (
    <div className={styles.container}>
      {/* Encabezado y acción principal */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Agenda Médica</h1>
          <p className={styles.subtitle}>
            Programación de turnos, consultas veterinarias y prevención de solapamientos (RF-39, RF-40)
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className={styles.primaryButton}
          >
            <PlusIcon size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
            <span>Agendar Cita</span>
          </button>
        </div>
      </header>

      {/* Barra de navegación de fecha */}
      <section className={styles.dateBar} aria-label="Navegación de fecha de agenda">
        <div className={styles.dateNav}>
          <button
            type="button"
            onClick={handlePrevDay}
            className={styles.navButton}
            aria-label="Día anterior"
          >
            <ChevronLeftIcon size={14} aria-hidden="true" />
            <span>Anterior</span>
          </button>
          <button
            type="button"
            onClick={handleToday}
            className={styles.navButton}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={handleNextDay}
            className={styles.navButton}
            aria-label="Día siguiente"
          >
            <span>Siguiente</span>
            <ChevronRightIcon size={14} aria-hidden="true" />
          </button>
          <span className={styles.currentDateText}>
            Fecha: <strong>{selectedDate}</strong>
          </span>
        </div>

        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={styles.datePickerInput}
            aria-label="Seleccionar fecha específica"
          />
        </div>
      </section>

      {/* Resumen de turnos del día */}
      <div className={styles.countersRow} role="status">
        <span className={styles.counterChip}>
          Total: <strong>{visits.length}</strong>
        </span>
        <span className={styles.counterChip}>
          Programadas: <strong>{scheduledCount}</strong>
        </span>
        <span className={styles.counterChip}>
          Atendidas: <strong>{attendedCount}</strong>
        </span>
        <span className={styles.counterChip}>
          Canceladas: <strong>{cancelledCount}</strong>
        </span>
      </div>

      {/* Grilla o lista de visitas */}
      {isLoading ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyDescription}>Cargando agenda médica...</p>
        </div>
      ) : visits.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <CalendarIcon size={32} />
          </div>
          <h2 className={styles.emptyTitle}>No hay citas programadas</h2>
          <p className={styles.emptyDescription}>
            No se registran visitas ni consultas programadas para la fecha {selectedDate}.
            Utilice el botón «Agendar Cita» para programar un nuevo turno.
          </p>
        </div>
      ) : (
        <div className={styles.visitsGrid}>
          {visits.map((visit) => {
            const isCancelled = visit.status === VISIT_STATUS_CANCELLED;
            const isAttended = Boolean(visit.closedAt);
            const isScheduled = !isCancelled && !isAttended;

            const petName = visit.pet?.name ?? 'Paciente no asignado';
            const petBreed = visit.pet?.breed ? `• ${visit.pet.breed}` : '';
            const vetName = visit.veterinarian
              ? `Dr. ${visit.veterinarian.name} ${visit.veterinarian.lastName}`
              : `Veterinario: ${visit.vetId}`;

            return (
              <article key={visit.id} className={styles.visitCard}>
                {/* Columna Horario */}
                <div className={styles.timeCol}>
                  <span className={styles.timeBadge}>
                    {formatTime(visit.startTime)}
                  </span>
                  <span className={styles.durationBadge}>
                    {visit.durationMinutes} minutos
                  </span>
                </div>

                {/* Columna Información */}
                <div className={styles.infoCol}>
                  <div className={styles.patientLine}>
                    <span className={styles.patientName}>{petName}</span>
                    {petBreed && (
                      <span className={styles.breedBadge}>{petBreed}</span>
                    )}
                  </div>
                  <div className={styles.vetLine}>{vetName}</div>
                  <div className={styles.reasonLine}>
                    <strong>Motivo:</strong> {visit.reason}
                  </div>

                  {/* Motivo de cancelación visible (RF-41) */}
                  {isCancelled && visit.cancellationReason && (
                    <div className={styles.cancellationBox}>
                      <strong>Motivo de Cancelación:</strong>{' '}
                      {visit.cancellationReason}
                    </div>
                  )}
                </div>

                {/* Columna Estado y Acciones */}
                <div className={styles.statusCol}>
                  {isCancelled && (
                    <span className={[styles.badge, styles.badgeCancelled].join(' ')}>
                      <CrossIcon size={12} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                      Cancelada
                    </span>
                  )}
                  {isAttended && (
                    <span className={[styles.badge, styles.badgeAttended].join(' ')}>
                      <CheckIcon size={12} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                      Atendida
                    </span>
                  )}
                  {isScheduled && (
                    <span className={[styles.badge, styles.badgeScheduled].join(' ')}>
                      Programada
                    </span>
                  )}

                  {/* Acción Cancelar solo disponible en turnos activos (RF-41) */}
                  {isScheduled && (
                    <button
                      type="button"
                      onClick={() => setSelectedVisitForCancel(visit)}
                      className={styles.cancelActionBtn}
                      aria-label={`Cancelar cita de ${petName}`}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal de Agendamiento de Nueva Cita (RF-39, RF-40) */}
      <NewVisitModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onVisitCreated={() => {
          void fetchVisitsForDate(selectedDate);
        }}
        visitsService={visitsService}
        availablePets={availablePets}
        availableVets={availableVets}
        initialScheduledDate={`${selectedDate}T09:00`}
      />

      {/* Diálogo de Cancelación Justificada Obligatoria (RF-41, RF-42) */}
      {selectedVisitForCancel && (
        <CancelVisitDialog
          isOpen={Boolean(selectedVisitForCancel)}
          visitId={selectedVisitForCancel.id}
          petName={selectedVisitForCancel.pet?.name}
          visitReason={selectedVisitForCancel.reason}
          onClose={() => setSelectedVisitForCancel(null)}
          onCancelled={() => {
            setSelectedVisitForCancel(null);
            void fetchVisitsForDate(selectedDate);
          }}
          visitsService={visitsService}
        />
      )}
    </div>
  );
};
