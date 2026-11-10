#!/usr/bin/env node

/**
 * Script de Verificación de Restauración Local de Copias de Seguridad (pnpm db:restore:verify).
 *
 * Restaura la última copia de seguridad (.sql.gz) en una base de datos temporal local
 * (ejecutada mediante Docker Compose) y verifica los conteos de registros en las tablas clave.
 *
 * Propósito operativo:
 * - Demostrar y auditar la recuperabilidad real de la información ante desastres.
 * - Neon en su plan gratuito conserva únicamente 6 horas de historial (Point-in-Time Recovery),
 *   por lo que las copias locales fuera de la nube constituyen el verdadero respaldo duradero.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync, spawn } = require('child_process');
const { getBackupDirectory } = require('./db-backup.js');

const KEY_TABLES = [
  'clinics',
  'users',
  'owners',
  'pets',
  'tags',
  'visits',
  'access_logs',
  'access_grants',
  'notifications',
];

const TEMP_DB_NAME = 'vet_app_restore_verify';
const CONTAINER_NAME = 'vet_app_postgres';

/**
 * Localiza la última copia de seguridad válida en el directorio de respaldos.
 */
function findLatestBackupFile(dir = getBackupDirectory()) {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('vetapp-backup-') && f.endsWith('.sql.gz'));

  if (files.length === 0) {
    return null;
  }

  // Ordenar alfabéticamente descendente (los nombres contienen timestamp ISO YYYYMMDD-HHmmss)
  files.sort().reverse();
  return path.join(dir, files[0]);
}

/**
 * Genera la sentencia SQL unificada para consultar los conteos de las tablas clave.
 */
function buildCountQuery(tables = KEY_TABLES) {
  return tables
    .map((table) => `SELECT '${table}' AS tabla, count(*)::int AS total FROM "${table}"`)
    .join('\nUNION ALL\n') + ';';
}

/**
 * Parsea la salida formateada con delimitador '|' de psql a un objeto de conteos.
 */
function parseCountOutput(rawOutput) {
  const result = {};
  const lines = rawOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('tabla') || trimmed.startsWith('-') || trimmed.startsWith('(')) {
      continue;
    }
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      const table = parts[0];
      const count = parseInt(parts[1], 10);
      if (!isNaN(count)) {
        result[table] = count;
      }
    }
  }
  return result;
}

/**
 * Verifica si el contenedor de PostgreSQL local está en ejecución o lo levanta con docker compose.
 */
function ensureLocalPostgresRunning() {
  console.log(`Verificando estado del contenedor PostgreSQL local (${CONTAINER_NAME})...`);
  const check = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER_NAME], {
    encoding: 'utf8',
  });

  if (check.status === 0 && check.stdout.trim() === 'true') {
    console.log(`✓ Contenedor ${CONTAINER_NAME} en ejecución.`);
    return true;
  }

  console.log('El contenedor local no está activo. Levantando servicios con "docker compose up -d postgres"...');
  const up = spawnSync('docker', ['compose', 'up', '-d', 'postgres'], {
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (up.status !== 0) {
    throw new Error('No fue posible levantar el servicio PostgreSQL local mediante Docker Compose.');
  }

  // Esperar a que PostgreSQL esté listo para aceptar conexiones
  console.log('Esperando disponibilidad de PostgreSQL (pg_isready)...');
  for (let i = 0; i < 20; i++) {
    const readyCheck = spawnSync(
      'docker',
      ['exec', CONTAINER_NAME, 'pg_isready', '-U', process.env.POSTGRES_USER || 'vet_admin'],
      { encoding: 'utf8' },
    );
    if (readyCheck.status === 0) {
      console.log('✓ PostgreSQL local está listo para recibir conexiones.');
      return true;
    }
    spawnSync('node', ['-e', 'setTimeout(() => {}, 1000)']);
  }

  throw new Error('Tiempo de espera agotado para la disponibilidad de PostgreSQL local.');
}

/**
 * Ejecuta el proceso integral de verificación de restauración.
 */
async function runRestoreVerify(options = {}) {
  const backupDir = options.backupDir || getBackupDirectory();
  const backupFile = options.backupFile || findLatestBackupFile(backupDir);

  if (!backupFile || !fs.existsSync(backupFile)) {
    throw new Error(
      `No se encontró ninguna copia de seguridad en "${backupDir}".\n` +
      'Genere una copia primero ejecutando: pnpm db:backup'
    );
  }

  const user = options.user || process.env.POSTGRES_USER || 'vet_admin';
  const keepDb = options.keepDb || process.argv.includes('--keep-db');
  const tempDb = options.tempDb || TEMP_DB_NAME;

  console.log('============================================================');
  console.log('VetApp - Verificación de Restauración de Copia de Seguridad');
  console.log('============================================================');
  console.log(`- Archivo de respaldo: ${backupFile}`);
  console.log(`- Base de datos temporal: ${tempDb} (local)`);
  console.log(`- Contenedor local: ${CONTAINER_NAME}`);
  console.log('------------------------------------------------------------');

  ensureLocalPostgresRunning();

  // 1. Recrear base de datos temporal limpia
  console.log(`Creando base de datos temporal limpia "${tempDb}"...`);
  spawnSync(
    'docker',
    [
      'exec',
      CONTAINER_NAME,
      'psql',
      '-U',
      user,
      '-d',
      'postgres',
      '-c',
      `DROP DATABASE IF EXISTS ${tempDb};`,
    ],
    { encoding: 'utf8' },
  );

  const createDbRes = spawnSync(
    'docker',
    [
      'exec',
      CONTAINER_NAME,
      'psql',
      '-U',
      user,
      '-d',
      'postgres',
      '-c',
      `CREATE DATABASE ${tempDb};`,
    ],
    { encoding: 'utf8' },
  );

  if (createDbRes.status !== 0) {
    throw new Error(`Error al crear la base de datos temporal: ${createDbRes.stderr}`);
  }

  // 2. Restaurar el archivo comprimido mediante streaming hacia psql
  console.log('Descomprimiendo y restaurando volcado SQL en base temporal...');
  const gunzip = zlib.createGunzip();
  const readStream = fs.createReadStream(backupFile);

  const restoreChild = spawn(
    'docker',
    ['exec', '-i', CONTAINER_NAME, 'psql', '-U', user, '-d', tempDb, '-q', '-v', 'ON_ERROR_STOP=1'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let restoreStderr = '';
  restoreChild.stderr.on('data', (d) => {
    restoreStderr += d.toString();
  });

  readStream.pipe(gunzip).pipe(restoreChild.stdin);

  await new Promise((resolve, reject) => {
    restoreChild.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `Fallo en la restauración de psql (código ${code}).\nDetalles:\n${restoreStderr.trim()}`
          )
        );
      }
      resolve();
    });

    restoreChild.on('error', (err) => {
      reject(new Error(`Error al ejecutar proceso de restauración: ${err.message}`));
    });

    gunzip.on('error', (err) => {
      reject(new Error(`Error al descomprimir el archivo gzip: ${err.message}`));
    });
  });

  console.log('✓ Restauración completada exitosamente.');

  // 3. Comprobar conteos en tablas clave
  console.log('Consultando conteos de registros en tablas clave...');
  const countSql = buildCountQuery(KEY_TABLES);
  const countRes = spawnSync(
    'docker',
    ['exec', CONTAINER_NAME, 'psql', '-U', user, '-d', tempDb, '-t', '-A', '-F', '|', '-c', countSql],
    { encoding: 'utf8' },
  );

  if (countRes.status !== 0) {
    throw new Error(`Error al consultar conteos de tablas clave: ${countRes.stderr}`);
  }

  const tableCounts = parseCountOutput(countRes.stdout);

  console.log('------------------------------------------------------------');
  console.log('CONTEOS DE REGISTROS VERIFICADOS TRAS RESTAURACIÓN:');
  console.log('------------------------------------------------------------');
  for (const table of KEY_TABLES) {
    const count = tableCounts[table] !== undefined ? tableCounts[table] : '(no encontrada)';
    console.log(`  - ${table.padEnd(16)} : ${count}`);
  }
  console.log('------------------------------------------------------------');

  // 4. Limpieza de base de datos temporal
  if (!keepDb) {
    console.log(`Eliminando base de datos temporal "${tempDb}"...`);
    spawnSync(
      'docker',
      ['exec', CONTAINER_NAME, 'psql', '-U', user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${tempDb};`],
      { encoding: 'utf8' },
    );
    console.log('✓ Limpieza completada.');
  } else {
    console.log(`Bandera --keep-db detectada: Base de datos "${tempDb}" preservada para inspección manual.`);
  }

  console.log('============================================================');
  console.log('✓ VERIFICACIÓN DE RESTAURACIÓN CONCLUIDA EXITOSAMENTE');
  console.log('============================================================');

  return {
    success: true,
    backupFile,
    tableCounts,
  };
}

// Ejecución directa si se invoca desde la línea de comandos
if (require.main === module) {
  runRestoreVerify()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\nFALLO EN VERIFICACIÓN DE RESTAURACIÓN:\n${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  KEY_TABLES,
  TEMP_DB_NAME,
  CONTAINER_NAME,
  findLatestBackupFile,
  buildCountQuery,
  parseCountOutput,
  ensureLocalPostgresRunning,
  runRestoreVerify,
};
