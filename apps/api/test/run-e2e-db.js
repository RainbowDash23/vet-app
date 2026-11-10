// Script ejecutor para pruebas e2e contra PostgreSQL real (Docker Compose / CI)
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawnSync } = require('child_process');

const rootEnvPath = path.resolve(__dirname, '../../..', '.env');
const apiEnvPath = path.resolve(__dirname, '..', '.env');

if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync(rootEnvPath)) {
    try {
      process.loadEnvFile(rootEnvPath);
    } catch {}
  } else if (fs.existsSync(apiEnvPath)) {
    try {
      process.loadEnvFile(apiEnvPath);
    } catch {}
  }
}

process.env.USE_REAL_DB = 'true';

const user = process.env.POSTGRES_USER || 'vet_admin';
const password = process.env.POSTGRES_PASSWORD;

if (!password) {
  console.error(
    'ERROR [test:e2e:db]: La variable de entorno POSTGRES_PASSWORD no está definida ni se encontró en el archivo .env.\n' +
      'Por favor configure POSTGRES_PASSWORD antes de ejecutar las pruebas contra PostgreSQL real.'
  );
  process.exit(1);
}

const defaultPort = process.env.POSTGRES_PORT || '5433';
const dbName = process.env.POSTGRES_DB || 'vet_app_db';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://${user}:${password}@localhost:${defaultPort}/${dbName}?schema=public`;

if (!process.env.DATABASE_URL.includes('connect_timeout')) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL += `${sep}connect_timeout=5`;
}

process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

function checkPostgresReachable(databaseUrl, defaultHost = '127.0.0.1', defaultPortNum = 5433) {
  let host = defaultHost;
  let port = defaultPortNum;

  try {
    const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
    host = parsed.hostname || defaultHost;
    port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  } catch {}

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(2000);

    const finish = (ok, errorMsg) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ ok, host, port, errorMsg });
      }
    };

    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false, 'Tiempo de espera agotado (timeout 2s)'));
    socket.on('error', (err) => finish(false, err.message));

    socket.connect(port, host);
  });
}

(async () => {
  const check = await checkPostgresReachable(
    process.env.DATABASE_URL,
    '127.0.0.1',
    parseInt(defaultPort, 10),
  );

  if (!check.ok) {
    console.error(
      `\nERROR [test:e2e:db]: No se pudo conectar a PostgreSQL en ${check.host}:${check.port} (${check.errorMsg || 'desconectado'}).\n` +
        'Las pruebas e2e:db requieren una base de datos PostgreSQL activa.\n' +
        "Inicie el servicio (por ejemplo, con 'docker compose up -d' o un PostgreSQL local)\n" +
        'o verifique las variables DATABASE_URL y POSTGRES_PORT antes de reintentar.\n'
    );
    process.exit(1);
  }

  const res = spawnSync(
    'node',
    [
      '-r',
      'ts-node/register',
      '--test',
      '--test-concurrency=1',
      'test/access-policy-leaks.e2e-spec.ts',
      'test/rollback.db-spec.ts',
      'test/bootstrap-admin.db-spec.ts',
      'test/crud-contracts.e2e-spec.ts',
    ],
    {
      stdio: 'inherit',
      env: process.env,
      shell: true,
      timeout: 180000,
    },
  );

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      console.error(
        'ERROR [test:e2e:db]: Las pruebas excedieron el tiempo límite de ejecución (timeout de 3 minutos).'
      );
    } else {
      console.error('ERROR [test:e2e:db]: Error al ejecutar el proceso de pruebas:', res.error);
    }
    process.exit(1);
  }

  process.exit(res.status ?? 0);
})().catch((err) => {
  console.error('ERROR [test:e2e:db]: Fallo no controlado:', err);
  process.exit(1);
});
