export interface ReleaseNote {
  version: string;
  title: string;
  date?: string;
  highlights: string[];
}

export const RELEASE_NOTES: Record<string, ReleaseNote> = {
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
