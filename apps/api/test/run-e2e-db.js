// Script ejecutor para pruebas e2e contra PostgreSQL real (Docker Compose / CI)
const path = require('path');
const fs = require('fs');

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

const port = process.env.POSTGRES_PORT || '5433';
const dbName = process.env.POSTGRES_DB || 'vet_app_db';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://${user}:${password}@localhost:${port}/${dbName}?schema=public`;

const { spawnSync } = require('child_process');
const res = spawnSync(
  'node',
  [
    '-r',
    'ts-node/register',
    '--test',
    '--test-concurrency=1',
    'test/access-policy-leaks.e2e-spec.ts',
    'test/rollback.db-spec.ts',
  ],
  {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  },
);

process.exit(res.status ?? 0);
