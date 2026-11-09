import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui';
import { ReleaseNote, getReleaseNotesForVersion } from '../../data/release-notes';
import styles from './whats-new-modal.module.css';

export interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  version?: string;
  customNotes?: ReleaseNote;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  version = '0.1.1',
  customNotes,
}) => {
  const notes = customNotes ?? getReleaseNotesForVersion(version) ?? {
    version,
    title: `Novedades de la versión ${version}`,
    highlights: [
      'Mejoras generales de rendimiento y estabilidad en el cliente de escritorio.',
      'Sincronización optimizada y resolución de historiales médicos.',
    ],
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.content} data-testid="whats-new-modal">
        <DialogHeader className={styles.header}>
          <span className={styles.versionBadge}>Versión {notes.version}</span>
          <DialogTitle className={styles.title}>{notes.title}</DialogTitle>
          <DialogDescription className={styles.description}>
            Conozca las mejoras y nuevas funciones incorporadas en esta actualización:
          </DialogDescription>
        </DialogHeader>

        <ul className={styles.highlightsList} data-testid="whats-new-list">
          {notes.highlights.map((point, index) => (
            <li key={index} className={styles.highlightItem}>
              <span className={styles.highlightBullet} aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className={styles.footer}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            data-testid="whats-new-close-btn"
          >
            Entendido
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
