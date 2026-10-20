// Script ejecutor para pruebas e2e contra PostgreSQL real (Docker Compose)
process.env.USE_REAL_DB = 'true';

const user = process.env.POSTGRES_USER || 'vet_admin';
const password = process.env.POSTGRES_PASSWORD || 'vet_secure_password_123';
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
    'test/rollback.e2e-spec.ts',
  ],
  {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  },
);

process.exit(res.status ?? 0);
