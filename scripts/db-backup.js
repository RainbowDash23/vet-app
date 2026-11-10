#!/usr/bin/env node

/**
 * Script de Copia de Seguridad Local de Base de Datos para VetApp (pnpm db:backup).
 *
 * Ejecuta pg_dump utilizando la imagen oficial postgres:16-alpine (misma versión mayor que Neon),
 * leyendo la cadena de conexión directa desde la variable de entorno BACKUP_DATABASE_URL.
 *
 * Reglas de seguridad:
 * - La URL y credenciales NUNCA se leen de archivos del repositorio ni se imprimen en consola/logs.
 * - El volcado comprimido (.sql.gz) se almacena FUERA del repositorio (por defecto en ~/.vetapp-backups).
 * - PROHIBIDO subir copias a artefactos de GitHub Actions o sitios públicos (contienen datos clínicos).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const POSTGRES_IMAGE = 'postgres:16-alpine';

/**
 * Sanitiza cualquier URL de base de datos para registrar diagnósticos seguros
 * sin exponer jamás contraseñas ni secretos en la salida estándar o logs.
 */
function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[REDACTED_URL]';
  }
}

/**
 * Determina el directorio de almacenamiento de copias de seguridad.
 * Por defecto apunta al directorio seguro del usuario (~/.vetapp-backups) FUERA del repositorio.
 */
function getBackupDirectory() {
  return process.env.BACKUP_DIR || path.join(os.homedir(), '.vetapp-backups');
}

/**
 * Genera el nombre de archivo con marca temporal formateada.
 * Patrón: vetapp-backup-YYYYMMDD-HHmmss.sql.gz
 */
function generateBackupFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `vetapp-backup-${year}${month}${day}-${hours}${minutes}${seconds}.sql.gz`;
}

/**
 * Ajusta referencias a 'localhost' o '127.0.0.1' para que el contenedor Docker
 * pueda resolver el host local adecuadamente si se prueba contra una base local.
 */
function resolveDockerHost(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'host.docker.internal';
      return parsed.toString();
    }
  } catch {
    // Si no es URL estándar se retorna tal cual
  }
  return rawUrl;
}

/**
 * Valida la presencia de la variable de entorno obligatoria sin fugar su contenido.
 */
function validateBackupEnvironment(env = process.env) {
  const url = env.BACKUP_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'La variable de entorno BACKUP_DATABASE_URL no está configurada.\n' +
      'Por razones de seguridad, la URL directa nunca debe incluirse en archivos del repositorio.\n' +
      'Configure la variable en su entorno o terminal antes de ejecutar la copia de seguridad:\n' +
      '  Linux/macOS: export BACKUP_DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/vet_app_db?sslmode=require"\n' +
      '  Windows PowerShell: $env:BACKUP_DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/vet_app_db?sslmode=require"\n'
    );
  }

  if (url.includes('pgbouncer=true') || url.includes(':6543')) {
    console.warn(
      'ADVERTENCIA: BACKUP_DATABASE_URL parece apuntar al pooler PgBouncer (puerto 6543).\n' +
      'pg_dump requiere la conexión directa (DIRECT_URL, puerto 5432) para acceder a los catálogos del sistema.\n'
    );
  }

  return url;
}

/**
 * Ejecuta el proceso de respaldo mediante contenedor Docker con pg_dump comprimido en streaming.
 */
async function runBackup(options = {}) {
  const env = options.env || process.env;
  const targetDir = options.backupDir || getBackupDirectory();
  const rawUrl = validateBackupEnvironment(env);
  const dockerUrl = resolveDockerHost(rawUrl);
  const now = options.now || new Date();
  const filename = options.filename || generateBackupFilename(now);

  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, filename);

  const safeSanitizedUrl = sanitizeDatabaseUrl(rawUrl);
  console.log('============================================================');
  console.log('VetApp - Copia de Seguridad de Base de Datos Local');
  console.log('============================================================');
  console.log(`- Motor: pg_dump vía contenedor ${POSTGRES_IMAGE}`);
  console.log(`- Destino: ${targetPath}`);
  console.log(`- Destino seguro: FUERA del repositorio`);
  console.log(`- Conexión: ${safeSanitizedUrl}`);
  console.log('------------------------------------------------------------');
  console.log('Iniciando volcado comprimido...');

  const gzip = zlib.createGzip({ level: 9 });
  const writeStream = fs.createWriteStream(targetPath);

  // Ejecución segura: la URL se transfiere por variable de entorno al contenedor Docker
  // sin exponer contraseñas en los argumentos de la lista de procesos.
  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    '-e',
    `DB_URL=${dockerUrl}`,
    POSTGRES_IMAGE,
    'sh',
    '-c',
    'pg_dump "$DB_URL" --clean --if-exists --no-owner --no-privileges',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrData = '';

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.stdout.pipe(gzip).pipe(writeStream);

    writeStream.on('error', (err) => {
      reject(new Error(`Error al escribir el archivo de respaldo: ${err.message}`));
    });

    child.on('error', (err) => {
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch {}
      reject(new Error(`Error al iniciar Docker para pg_dump: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        try {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        } catch {}

        // Sanitizar cualquier posible contraseña en el stderr antes de mostrarlo
        const safeStderr = stderrData.replace(/:[^:@/]+@/g, ':***@');
        return reject(
          new Error(
            `El contenedor pg_dump finalizó con código de error ${code}.\n` +
            `Detalles de error:\n${safeStderr.trim() || '(Sin salida de error)'}`
          )
        );
      }

      writeStream.on('finish', () => {
        try {
          const stats = fs.statSync(targetPath);
          console.log('------------------------------------------------------------');
          console.log('✓ Copia de seguridad completada con éxito.');
          console.log(`- Archivo: ${targetPath}`);
          console.log(`- Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
          console.log(`- Timestamp: ${now.toISOString()}`);
          console.log('============================================================');
          resolve({
            success: true,
            filePath: targetPath,
            sizeBytes: stats.size,
            filename,
            timestamp: now,
          });
        } catch (statErr) {
          reject(statErr);
        }
      });
    });
  });
}

// Ejecutar directamente si es invocado como script principal
if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\nFALLO EN COPIA DE SEGURIDAD: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  POSTGRES_IMAGE,
  sanitizeDatabaseUrl,
  getBackupDirectory,
  generateBackupFilename,
  resolveDockerHost,
  validateBackupEnvironment,
  runBackup,
};
