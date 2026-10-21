import React, { useState, useEffect, useMemo } from 'react';
import type {
  VisitResponseDto,
  VisitNoteResponseDto,
  AttendVisitDto,
} from '@vet-app/shared-types';
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/ui';
import { AddNoteModal } from '../components/screens/add-note-modal';
import { visitsService as defaultVisitsService, VisitsService } from '../services/visits.service';
import { ApiError } from '../services/api.client';
import { useSafeDirtyGuard } from '../hooks/use-form-dirty-guard';
import styles from './visit-consultation-screen.module.css';

export interface VitalsInput {
  weight?: number | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  capillaryRefillTime?: number | null;
}

/**
 * Rangos biológicos y fisiológicos oficiales (RF-44).
 */
export const BIOLOGICAL_RANGES = {
  weight: { min: 0.05, max: 150.0 },
  temperature: { min: 32.0, max: 43.0 },
  heartRate: { min: 30, max: 300 },
  respiratoryRate: { min: 10, max: 120 },
  capillaryRefillTime: { min: 1, max: 5 },
} as const;

/**
 * Validador en cliente para las constantes vitales veterinarias (RF-44).
 * Retorna un mapa de errores con los mensajes estandarizados de la especificación.
 */
export function validateBiologicalVitals(vitals: VitalsInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (vitals.weight !== undefined && vitals.weight !== null) {
    if (
      typeof vitals.weight !== 'number' ||
      isNaN(vitals.weight) ||
      vitals.weight < BIOLOGICAL_RANGES.weight.min ||
      vitals.weight > BIOLOGICAL_RANGES.weight.max
    ) {
      errors.weight = 'El peso debe encontrarse entre 0.05 kg y 150.0 kg';
    }
  }

  if (vitals.temperature !== undefined && vitals.temperature !== null) {
    if (
      typeof vitals.temperature !== 'number' ||
      isNaN(vitals.temperature) ||
      vitals.temperature < BIOLOGICAL_RANGES.temperature.min ||
      vitals.temperature > BIOLOGICAL_RANGES.temperature.max
    ) {
      errors.temperature = 'La temperatura corporal debe encontrarse entre 32.0 °C y 43.0 °C';
    }
  }

  if (vitals.heartRate !== undefined && vitals.heartRate !== null) {
    if (
      typeof vitals.heartRate !== 'number' ||
      isNaN(vitals.heartRate) ||
      !Number.isInteger(vitals.heartRate) ||
      vitals.heartRate < BIOLOGICAL_RANGES.heartRate.min ||
      vitals.heartRate > BIOLOGICAL_RANGES.heartRate.max
    ) {
      errors.heartRate = 'La frecuencia cardíaca debe encontrarse entre 30 y 300 lpm';
    }
  }

  if (vitals.respiratoryRate !== undefined && vitals.respiratoryRate !== null) {
    if (
      typeof vitals.respiratoryRate !== 'number' ||
      isNaN(vitals.respiratoryRate) ||
      !Number.isInteger(vitals.respiratoryRate) ||
      vitals.respiratoryRate < BIOLOGICAL_RANGES.respiratoryRate.min ||
      vitals.respiratoryRate > BIOLOGICAL_RANGES.respiratoryRate.max
    ) {
      errors.respiratoryRate = 'La frecuencia respiratoria debe encontrarse entre 10 y 120 rpm';
    }
  }

  if (vitals.capillaryRefillTime !== undefined && vitals.capillaryRefillTime !== null) {
    if (
      typeof vitals.capillaryRefillTime !== 'number' ||
      isNaN(vitals.capillaryRefillTime) ||
      !Number.isInteger(vitals.capillaryRefillTime) ||
      vitals.capillaryRefillTime < BIOLOGICAL_RANGES.capillaryRefillTime.min ||
      vitals.capillaryRefillTime > BIOLOGICAL_RANGES.capillaryRefillTime.max
    ) {
      errors.capillaryRefillTime = 'El tiempo de llenado capilar debe encontrarse entre 1 y 5 segundos';
    }
  }

  return errors;
}

export interface VisitConsultationScreenProps {
  visitId?: string;
  initialVisit?: VisitResponseDto;
  visitsService?: VisitsService;
  onCloseScreen?: () => void;
}

/**
 * Pantalla de atención médica, registro de constantes vitales, cierre formal
 * y notas evolutivas complementarias (T36 / RF-43, RF-44, RF-45, RF-46).
 */
export const VisitConsultationScreen: React.FC<VisitConsultationScreenProps> = ({
  visitId,
  initialVisit,
  visitsService = defaultVisitsService,
  onCloseScreen,
}) => {
  const [visit, setVisit] = useState<VisitResponseDto | null>(initialVisit ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialVisit && Boolean(visitId));

  // Estados del formulario clínico
  const [weight, setWeight] = useState<string>(
    initialVisit?.weight !== undefined && initialVisit?.weight !== null ? String(initialVisit.weight) : '',
  );
  const [temperature, setTemperature] = useState<string>(
    initialVisit?.temperature !== undefined && initialVisit?.temperature !== null ? String(initialVisit.temperature) : '',
  );
  const [heartRate, setHeartRate] = useState<string>(
    initialVisit?.heartRate !== undefined && initialVisit?.heartRate !== null ? String(initialVisit.heartRate) : '',
  );
  const [respiratoryRate, setRespiratoryRate] = useState<string>(
    initialVisit?.respiratoryRate !== undefined && initialVisit?.respiratoryRate !== null ? String(initialVisit.respiratoryRate) : '',
  );
  const [capillaryRefillTime, setCapillaryRefillTime] = useState<string>(
    initialVisit?.capillaryRefillTime !== undefined && initialVisit?.capillaryRefillTime !== null ? String(initialVisit.capillaryRefillTime) : '',
  );

  const [notes, setNotes] = useState<string>(initialVisit?.notes ?? '');
  const [diagnosis, setDiagnosis] = useState<string>(initialVisit?.diagnosis ?? '');
  const [treatment, setTreatment] = useState<string>(initialVisit?.treatment ?? '');

  // Notas de evolución asociadas a la visita
  const [notesList, setNotesList] = useState<VisitNoteResponseDto[]>(initialVisit?.visitNotes ?? []);

  // Modales y estados de confirmación
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState<boolean>(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState<boolean>(false);

  // Estados de proceso
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Determina si la consulta se encuentra cerrada e inmutable (RF-45)
  const isClosed = Boolean(visit?.closedAt);

  // Detección de cambios no guardados en el formulario de consulta (RF-33)
  const isDirty = useMemo(() => {
    if (isClosed) return false;
    return (
      weight !== (initialVisit?.weight !== undefined && initialVisit?.weight !== null ? String(initialVisit.weight) : '') ||
      temperature !== (initialVisit?.temperature !== undefined && initialVisit?.temperature !== null ? String(initialVisit.temperature) : '') ||
      heartRate !== (initialVisit?.heartRate !== undefined && initialVisit?.heartRate !== null ? String(initialVisit.heartRate) : '') ||
      respiratoryRate !== (initialVisit?.respiratoryRate !== undefined && initialVisit?.respiratoryRate !== null ? String(initialVisit.respiratoryRate) : '') ||
      capillaryRefillTime !== (initialVisit?.capillaryRefillTime !== undefined && initialVisit?.capillaryRefillTime !== null ? String(initialVisit.capillaryRefillTime) : '') ||
      notes !== (initialVisit?.notes ?? '') ||
      diagnosis !== (initialVisit?.diagnosis ?? '') ||
      treatment !== (initialVisit?.treatment ?? '')
    );
  }, [isClosed, weight, temperature, heartRate, respiratoryRate, capillaryRefillTime, notes, diagnosis, treatment, initialVisit]);

  const safeDirtyGuard = useSafeDirtyGuard();
  useEffect(() => {
    safeDirtyGuard?.setIsDirty(isDirty);
    return () => {
      safeDirtyGuard?.setIsDirty(false);
    };
  }, [safeDirtyGuard, isDirty]);

  // Carga inicial si solo se pasó visitId
  useEffect(() => {
    if (visitId && !initialVisit) {
      let active = true;
      setIsLoading(true);
      visitsService
        .getVisitById(visitId)
        .then((data) => {
          if (!active) return;
          setVisit(data);
          if (data.weight !== null && data.weight !== undefined) setWeight(String(data.weight));
          if (data.temperature !== null && data.temperature !== undefined) setTemperature(String(data.temperature));
          if (data.heartRate !== null && data.heartRate !== undefined) setHeartRate(String(data.heartRate));
          if (data.respiratoryRate !== null && data.respiratoryRate !== undefined) setRespiratoryRate(String(data.respiratoryRate));
          if (data.capillaryRefillTime !== null && data.capillaryRefillTime !== undefined) setCapillaryRefillTime(String(data.capillaryRefillTime));
          if (data.notes) setNotes(data.notes);
          if (data.diagnosis) setDiagnosis(data.diagnosis);
          if (data.treatment) setTreatment(data.treatment);
          if (data.visitNotes) setNotesList(data.visitNotes);
        })
        .catch((err) => {
          if (!active) return;
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Error al cargar la visita médica',
          });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });

      return () => {
        active = false;
      };
    }
  }, [visitId, initialVisit, visitsService]);

  // Validación inmediata de rangos biológicos en cliente (RF-44)
  const vitalsErrors = useMemo(() => {
    const parseNumber = (val: string) => {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const num = Number(trimmed);
      return isNaN(num) ? NaN : num;
    };

    return validateBiologicalVitals({
      weight: parseNumber(weight),
      temperature: parseNumber(temperature),
      heartRate: parseNumber(heartRate),
      respiratoryRate: parseNumber(respiratoryRate),
      capillaryRefillTime: parseNumber(capillaryRefillTime),
    });
  }, [weight, temperature, heartRate, respiratoryRate, capillaryRefillTime]);

  const hasVitalsErrors = Object.keys(vitalsErrors).length > 0;

  // Guardar atención médica (RF-43, RF-44)
  const handleSaveAttention = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isClosed || isSaving || hasVitalsErrors || !visit) return;

    setIsSaving(true);
    setFeedback(null);

    const parseOptionalNumber = (val: string) => {
      const trimmed = val.trim();
      return trimmed ? Number(trimmed) : undefined;
    };

    const payload: AttendVisitDto = {
      notes: notes.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
      treatment: treatment.trim() || undefined,
      weight: parseOptionalNumber(weight),
      temperature: parseOptionalNumber(temperature),
      heartRate: parseOptionalNumber(heartRate),
      respiratoryRate: parseOptionalNumber(respiratoryRate),
      capillaryRefillTime: parseOptionalNumber(capillaryRefillTime),
    };

    try {
      const updated = await visitsService.attendVisit(visit.id, payload);
      setVisit(updated);
      setFeedback({
        type: 'success',
        message: 'Atención médica y constantes vitales guardadas correctamente.',
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedback({
          type: 'error',
          message: err.message || 'Error al guardar la atención médica.',
        });
      } else if (err instanceof Error) {
        setFeedback({ type: 'error', message: err.message });
      } else {
        setFeedback({
          type: 'error',
          message: 'Error inesperado al guardar la consulta.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Cierre formal de consulta médica (RF-45)
  const handleConfirmClose = async () => {
    if (!visit || isClosed || isClosing) return;

    setIsClosing(true);
    setFeedback(null);

    try {
      const closed = await visitsService.closeVisit(visit.id);
      setVisit(closed);
      setIsCloseConfirmOpen(false);
      setFeedback({
        type: 'success',
        message: 'Consulta cerrada formalmente. La historia clínica es ahora inmutable (RF-45).',
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedback({
          type: 'error',
          message: err.message || 'Error al cerrar la consulta médica.',
        });
      } else if (err instanceof Error) {
        setFeedback({ type: 'error', message: err.message });
      } else {
        setFeedback({
          type: 'error',
          message: 'Error inesperado al cerrar la consulta.',
        });
      }
    } finally {
      setIsClosing(false);
    }
  };

  // Callback tras añadir nota evolutiva complementaria (RF-46)
  const handleNoteAdded = (newNote: VisitNoteResponseDto) => {
    setNotesList((prev) => [newNote, ...prev]);
    setFeedback({
      type: 'success',
      message: 'Nota de evolución complementaria registrada con éxito (RF-46).',
    });
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.alertBanner} role="status">
          <span>Cargando datos de la consulta médica...</span>
        </div>
      </div>
    );
  }

  const petName = visit?.pet?.name ?? 'Paciente';
  const petBreed = visit?.pet?.breed ? ` • ${visit.pet.breed}` : '';
  const vetName = visit?.veterinarian
    ? `Dr. ${visit.veterinarian.name} ${visit.veterinarian.lastName ?? ''}`.trim()
    : 'Veterinario Asignado';

  return (
    <div className={styles.container}>
      {/* Cabecera de la Consulta */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Consulta Médica</h1>
            {isClosed ? (
              <span className={styles.closedBadge} role="status">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Consulta Cerrada (Inmutable)
              </span>
            ) : (
              <span className={styles.activeBadge} role="status">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Consulta en Curso
              </span>
            )}
          </div>
          <div className={styles.patientMeta}>
            <span>Paciente: <strong className={styles.patientHighlight}>{petName}</strong>{petBreed}</span>
            <span>|</span>
            <span>Profesional: <strong>{vetName}</strong></span>
            {visit?.reason && (
              <>
                <span>|</span>
                <span>Motivo: <em>{visit.reason}</em></span>
              </>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          {isClosed ? (
            <Button
              variant="primary"
              onClick={() => setIsAddNoteModalOpen(true)}
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              }
            >
              Añadir Nota de Evolución
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setIsCloseConfirmOpen(true)}
              disabled={isSaving || isClosing}
            >
              Cerrar Consulta Médica
            </Button>
          )}

          {onCloseScreen && (
            <Button variant="outline" onClick={onCloseScreen}>
              Volver
            </Button>
          )}
        </div>
      </header>

      {/* Banner de retroalimentación accesible */}
      {feedback && (
        <div
          className={`${styles.alertBanner} ${feedback.type === 'error' ? styles.alertError : styles.alertSuccess}`}
          role="alert"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {feedback.type === 'error' ? (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            ) : (
              <polyline points="20 6 9 17 4 12" />
            )}
          </svg>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Cuadrícula Principal: Evaluación Clínica y Notas Evolutivas */}
      <div className={styles.contentGrid}>
        {/* Columna Izquierda: Formulario de Constantes y Evaluación Médica */}
        <form onSubmit={handleSaveAttention} className={styles.formGroup}>
          {/* Tarjeta de Constantes Fisiológicas (RF-44) */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                Constantes Vitales (Fisiológicas)
              </h2>
              {isClosed && (
                <span className={styles.vitalUnit}>(Bloqueadas por cierre inmutable)</span>
              )}
            </div>

            <div className={styles.vitalsGrid}>
              {/* Peso */}
              <div className={styles.vitalField}>
                <label htmlFor="vital-weight" className={styles.vitalLabel}>
                  <span>Peso</span>
                  <span className={styles.vitalUnit}>(0.05 - 150.0 kg)</span>
                </label>
                <div className={styles.vitalInputWrapper}>
                  <input
                    id="vital-weight"
                    type="number"
                    step="0.01"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    disabled={isClosed || isSaving}
                    className={`${styles.vitalInput} ${vitalsErrors.weight ? styles.vitalInputError : ''}`}
                    placeholder="Ej. 12.5"
                    aria-invalid={Boolean(vitalsErrors.weight)}
                    aria-describedby={vitalsErrors.weight ? 'error-weight' : undefined}
                  />
                </div>
                {vitalsErrors.weight && (
                  <span id="error-weight" className={styles.fieldError} role="alert">
                    {vitalsErrors.weight}
                  </span>
                )}
              </div>

              {/* Temperatura */}
              <div className={styles.vitalField}>
                <label htmlFor="vital-temperature" className={styles.vitalLabel}>
                  <span>Temperatura</span>
                  <span className={styles.vitalUnit}>(32.0 - 43.0 °C)</span>
                </label>
                <div className={styles.vitalInputWrapper}>
                  <input
                    id="vital-temperature"
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    disabled={isClosed || isSaving}
                    className={`${styles.vitalInput} ${vitalsErrors.temperature ? styles.vitalInputError : ''}`}
                    placeholder="Ej. 38.5"
                    aria-invalid={Boolean(vitalsErrors.temperature)}
                    aria-describedby={vitalsErrors.temperature ? 'error-temperature' : undefined}
                  />
                </div>
                {vitalsErrors.temperature && (
                  <span id="error-temperature" className={styles.fieldError} role="alert">
                    {vitalsErrors.temperature}
                  </span>
                )}
              </div>

              {/* Frecuencia Cardíaca */}
              <div className={styles.vitalField}>
                <label htmlFor="vital-heart-rate" className={styles.vitalLabel}>
                  <span>Frecuencia Cardíaca</span>
                  <span className={styles.vitalUnit}>(30 - 300 lpm)</span>
                </label>
                <div className={styles.vitalInputWrapper}>
                  <input
                    id="vital-heart-rate"
                    type="number"
                    step="1"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    disabled={isClosed || isSaving}
                    className={`${styles.vitalInput} ${vitalsErrors.heartRate ? styles.vitalInputError : ''}`}
                    placeholder="Ej. 110"
                    aria-invalid={Boolean(vitalsErrors.heartRate)}
                    aria-describedby={vitalsErrors.heartRate ? 'error-heart-rate' : undefined}
                  />
                </div>
                {vitalsErrors.heartRate && (
                  <span id="error-heart-rate" className={styles.fieldError} role="alert">
                    {vitalsErrors.heartRate}
                  </span>
                )}
              </div>

              {/* Frecuencia Respiratoria */}
              <div className={styles.vitalField}>
                <label htmlFor="vital-respiratory-rate" className={styles.vitalLabel}>
                  <span>Frecuencia Respiratoria</span>
                  <span className={styles.vitalUnit}>(10 - 120 rpm)</span>
                </label>
                <div className={styles.vitalInputWrapper}>
                  <input
                    id="vital-respiratory-rate"
                    type="number"
                    step="1"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    disabled={isClosed || isSaving}
                    className={`${styles.vitalInput} ${vitalsErrors.respiratoryRate ? styles.vitalInputError : ''}`}
                    placeholder="Ej. 24"
                    aria-invalid={Boolean(vitalsErrors.respiratoryRate)}
                    aria-describedby={vitalsErrors.respiratoryRate ? 'error-respiratory-rate' : undefined}
                  />
                </div>
                {vitalsErrors.respiratoryRate && (
                  <span id="error-respiratory-rate" className={styles.fieldError} role="alert">
                    {vitalsErrors.respiratoryRate}
                  </span>
                )}
              </div>

              {/* Tiempo de Llenado Capilar */}
              <div className={styles.vitalField}>
                <label htmlFor="vital-tllc" className={styles.vitalLabel}>
                  <span>Tiempo de Llenado Capilar</span>
                  <span className={styles.vitalUnit}>(1 - 5 s)</span>
                </label>
                <div className={styles.vitalInputWrapper}>
                  <input
                    id="vital-tllc"
                    type="number"
                    step="1"
                    value={capillaryRefillTime}
                    onChange={(e) => setCapillaryRefillTime(e.target.value)}
                    disabled={isClosed || isSaving}
                    className={`${styles.vitalInput} ${vitalsErrors.capillaryRefillTime ? styles.vitalInputError : ''}`}
                    placeholder="Ej. 2"
                    aria-invalid={Boolean(vitalsErrors.capillaryRefillTime)}
                    aria-describedby={vitalsErrors.capillaryRefillTime ? 'error-tllc' : undefined}
                  />
                </div>
                {vitalsErrors.capillaryRefillTime && (
                  <span id="error-tllc" className={styles.fieldError} role="alert">
                    {vitalsErrors.capillaryRefillTime}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Tarjeta de Evaluación Médica (RF-43) */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Evaluación Clínica y Prescripción
              </h2>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinical-notes" className={styles.label}>
                Anamnesis y Observaciones Clínicas
              </label>
              <textarea
                id="clinical-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isClosed || isSaving}
                className={styles.textarea}
                placeholder="Registre hallazgos clínicos relevantes, antecedentes de la dolencia actual y conducta del paciente..."
                rows={3}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinical-diagnosis" className={styles.label}>
                Diagnóstico Presuntivo / Definitivo
              </label>
              <textarea
                id="clinical-diagnosis"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                disabled={isClosed || isSaving}
                className={styles.textarea}
                placeholder="Diagnóstico nosológico, sindrómico o definitivo..."
                rows={2}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="clinical-treatment" className={styles.label}>
                Tratamiento y Prescripciones Farmacológicas
              </label>
              <textarea
                id="clinical-treatment"
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                disabled={isClosed || isSaving}
                className={styles.textarea}
                placeholder="Indicaciones terapéuticas, fármacos, posología, pautas de administración y fecha sugerida de control..."
                rows={3}
              />
            </div>

            {!isClosed && (
              <div className={styles.bottomActions}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={hasVitalsErrors || isSaving}
                  isLoading={isSaving}
                >
                  Guardar Atención
                </Button>
              </div>
            )}
          </section>
        </form>

        {/* Columna Derecha: Notas Evolutivas Complementarias Inmutables (RF-46) */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Notas de Evolución (Inmutables)
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddNoteModalOpen(true)}
            >
              Añadir Nota de Evolución
            </Button>
          </div>

          <div className={styles.notesContainer}>
            {notesList.length === 0 ? (
              <div className={styles.emptyNotes}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <p>No se han registrado notas complementarias de evolución clínica para esta consulta.</p>
              </div>
            ) : (
              <div className={styles.notesList}>
                {notesList.map((note) => {
                  const authorName = note.veterinarian
                    ? `Dr. ${note.veterinarian.name} ${note.veterinarian.lastName ?? ''}`.trim()
                    : 'Profesional Veterinario';
                  const dateStr = note.createdAt
                    ? new Date(note.createdAt).toLocaleString('es-ES', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '';

                  return (
                    <article key={note.id} className={styles.noteCard}>
                      <div className={styles.noteHeader}>
                        <span className={styles.noteAuthor}>{authorName}</span>
                        <span>{dateStr}</span>
                      </div>
                      <p className={styles.noteContent}>{note.content || note.note}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Diálogo Modal de Adición de Notas (RF-46) */}
      {visit && (
        <AddNoteModal
          isOpen={isAddNoteModalOpen}
          visitId={visit.id}
          onClose={() => setIsAddNoteModalOpen(false)}
          onNoteAdded={handleNoteAdded}
          visitsService={visitsService}
        />
      )}

      {/* Diálogo de Confirmación de Cierre de Consulta (RF-45) */}
      <AlertDialog open={isCloseConfirmOpen} onOpenChange={setIsCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Cierre Formal de la Consulta?</AlertDialogTitle>
            <AlertDialogDescription>
              Al cerrar formalmente la consulta médica, el diagnóstico, constantes vitales y prescripciones quedarán bloqueados permanentemente en modo solo lectura inmutable (RF-45). Cualquier adición posterior deberá realizarse mediante notas de evolución complementarias (RF-46).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmClose();
              }}
              disabled={isClosing}
            >
              {isClosing ? 'Cerrando...' : 'Confirmar Cierre Inmutable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
