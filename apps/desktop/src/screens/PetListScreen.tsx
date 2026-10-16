import React from 'react';
import styles from './PetListScreen.module.css';

export const PetListScreen: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Lista de Mascotas</h1>
          <p className={styles.subtitle}>
            Pacientes registrados y vinculación con llaveros NFC
          </p>
        </div>
      </div>

      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>📋</span>
        <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
          Sin pacientes cargados aún
        </h3>
        <p className={styles.emptyText}>
          Esta pantalla vacía formará parte del listado paginado conectado a la API de NestJS.
          Acerca un llavero NFC o pulsa el botón de simulación en la barra lateral para buscar de inmediato.
        </p>
      </div>
    </div>
  );
};
