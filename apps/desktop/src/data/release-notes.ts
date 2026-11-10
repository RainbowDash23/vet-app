export interface ReleaseNote {
  version: string;
  title: string;
  date?: string;
  highlights: string[];
}

export const RELEASE_NOTES: Record<string, ReleaseNote> = {
  '0.2.0': {
    version: '0.2.0',
    title: 'Novedades de la versión 0.2.0',
    date: 'Noviembre 2026',
    highlights: [
      'Auditoría integral y paridad de contratos CRUD entre la aplicación de escritorio y la API.',
      'Edición completa de fichas de pacientes y datos de contacto de propietarios con validación sintáctica estricta.',
      'Baja lógica de pacientes con protección ante historiales con consultas previas (HTTP 409 Conflict).',
      'Gestión avanzada de llaveros NFC: reporte de extravío o deterioro con confirmación y reasignación ágil.',
      'Nueva pantalla de gestión institucional para administradores: configuración de teléfono internacional E.164 y dirección que alimentan el portal público de auxilio.',
      'Registro oficial de aplicaciones de vacunas con fecha estimada de próximo refuerzo (nextDueDate) en el carnet sanitario.',
    ],
  },
  '0.1.1': {
    version: '0.1.1',
    title: 'Novedades de la versión 0.1.1',
    date: 'Noviembre 2026',
    highlights: [
      'Paleta de comandos y búsqueda rápida accesible mediante la combinación de teclas Ctrl+K o Esc.',
      'Búsqueda instantánea de pacientes por nombre de mascota, dueño o documento con navegación por teclado.',
      'Acciones rápidas contextuales según el rol del usuario (alta de mascotas, dueños, agenda y administración).',
      'Visualización de la versión instalada y acceso directo al historial de novedades desde la barra lateral.',
    ],
  },
  '0.1.0': {
    version: '0.1.0',
    title: 'Novedades de la versión 0.1.0',
    date: 'Noviembre 2026',
    highlights: [
      'Lanzamiento inicial del cliente de escritorio con soporte de comunicación serial USB para lectores NFC.',
      'Gestión integral de pacientes, historial clínico, carnet de vacunación y agenda médica veterinaria.',
      'Aislamiento multi-tenant estricto y portal de contingencia de rescate.',
    ],
  },
};

export function getReleaseNotesForVersion(version: string): ReleaseNote | undefined {
  return RELEASE_NOTES[version];
}
