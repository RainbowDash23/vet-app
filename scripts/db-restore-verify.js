#!/usr/bin/env node

/**
 * Script de Verificación de Restauración Local de Copias de Seguridad (pnpm db:restore:verify).
 *
 * Restaura la última copia de seguridad (.sql.gz) en un contenedor temporal de PostgreSQL
 * de la misma versión que Neon (postgres:18-alpine por defecto) y verifica los conteos
 * de registros en las tablas clave.
 *
 * El contenedor temporal se destruye y elimina automáticamente al finalizar,
 * incluso ante fallos o excepciones, garantizando limpieza absoluta e independencia de versiones.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync, spawn } = require('child_process');
const {
  getBackupDirectory,
  DEFAULT_PG_VERSION,
  getPostgresImage,
  POSTGRES_IMAGE,
} = require('./db-backup.js');

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
const CONTAINER_NAME = 'vet_app_restore_verify';

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
 * Ejecuta el proceso integral de verificación de restauración en un contenedor temporal aislado.
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

  const env = options.env || process.env;
  const pgVersion = options.pgVersion || env.BACKUP_PG_VERSION || DEFAULT_PG_VERSION;
  const postgresImage = options.postgresImage || getPostgresImage(pgVersion);
  const containerName = options.containerName || `vetapp_restore_verify_${Date.now()}`;
  const user = options.user || 'vet_admin';
  const tempPassword = 'restore_verify_secure_password';
  const keepDb = options.keepDb || process.argv.includes('--keep-db');
  const tempDb = options.tempDb || TEMP_DB_NAME;

  console.log('============================================================');
  console.log('VetApp - Verificación de Restauración de Copia de Seguridad');
  console.log('============================================================');
  console.log(`- Archivo de respaldo: ${backupFile}`);
  console.log(`- Base de datos temporal: ${tempDb}`);
  console.log(`- Contenedor temporal: ${containerName} (${postgresImage})`);
  console.log('------------------------------------------------------------');

  let containerStarted = false;

  try {
    // 1. Iniciar contenedor temporal aislado de la misma versión de Postgres
    console.log(`Iniciando contenedor temporal ${containerName} (${postgresImage})...`);
    const runRes = spawnSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        containerName,
        '-e',
        `POSTGRES_USER=${user}`,
        '-e',
        `POSTGRES_PASSWORD=${tempPassword}`,
        '-e',
        'POSTGRES_DB=postgres',
        postgresImage,
      ],
      { encoding: 'utf8' }
    );

    if (runRes.status !== 0) {
      throw new Error(`Error al iniciar el contenedor temporal ${containerName}: ${runRes.stderr || runRes.stdout}`);
    }
    containerStarted = true;

    // 2. Esperar a que PostgreSQL esté listo en el contenedor temporal
    console.log('Esperando disponibilidad de PostgreSQL en el contenedor temporal (pg_isready)...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const readyCheck = spawnSync(
        'docker',
        ['exec', containerName, 'pg_isready', '-U', user],
        { encoding: 'utf8' }
      );
      if (readyCheck.status === 0) {
        ready = true;
        console.log('✓ PostgreSQL en contenedor temporal listo para recibir conexiones.');
        break;
      }
      spawnSync('node', ['-e', 'setTimeout(() => {}, 1000)']);
    }

    if (!ready) {
      throw new Error(`Tiempo de espera agotado para la disponibilidad de PostgreSQL en ${containerName}.`);
    }

    // 3. Crear base de datos temporal
    console.log(`Creando base de datos temporal "${tempDb}"...`);
    const createDbRes = spawnSync(
      'docker',
      ['exec', containerName, 'psql', '-U', user, '-d', 'postgres', '-c', `CREATE DATABASE ${tempDb};`],
      { encoding: 'utf8' }
    );

    if (createDbRes.status !== 0) {
      throw new Error(`Error al crear la base de datos temporal: ${createDbRes.stderr || createDbRes.stdout}`);
    }

    // 4. Restaurar el archivo comprimido mediante streaming hacia psql dentro del contenedor temporal
    console.log('Descomprimiendo y restaurando volcado SQL en base temporal...');
    const gunzip = zlib.createGunzip();
    const readStream = fs.createReadStream(backupFile);

    const restoreChild = spawn(
      'docker',
      ['exec', '-i', containerName, 'psql', '-U', user, '-d', tempDb, '-q', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
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

    // 5. Comprobar conteos en tablas clave
    console.log('Consultando conteos de registros en tablas clave...');
    const countSql = buildCountQuery(KEY_TABLES);
    const countRes = spawnSync(
      'docker',
      ['exec', containerName, 'psql', '-U', user, '-d', tempDb, '-t', '-A', '-F', '|', '-c', countSql],
      { encoding: 'utf8' }
    );

    if (countRes.status !== 0) {
      throw new Error(`Error al consultar conteos de tablas clave: ${countRes.stderr || countRes.stdout}`);
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
    console.log('============================================================');
    console.log('✓ VERIFICACIÓN DE RESTAURACIÓN CONCLUIDA EXITOSAMENTE');
    console.log('============================================================');

    return {
      success: true,
      backupFile,
      containerName,
      postgresImage,
      tableCounts,
    };
  } finally {
    // 6. El contenedor temporal se elimina al terminar, incluso si hay error
    if (containerStarted) {
      if (!keepDb) {
        console.log(`Eliminando contenedor temporal "${containerName}"...`);
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
        console.log('✓ Contenedor temporal eliminado.');
      } else {
        console.log(`Bandera --keep-db detectada: Contenedor "${containerName}" preservado para inspección manual.`);
      }
    }
  }
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
  runRestoreVerify,
};
