import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Importar funciones auxiliares desde los scripts de operaciones
const {
  sanitizeDatabaseUrl,
  getBackupDirectory,
  generateBackupFilename,
  resolveDockerHost,
  validateBackupEnvironment,
  POSTGRES_IMAGE,
} = require('../../../../scripts/db-backup.js');

const {
  KEY_TABLES,
  TEMP_DB_NAME,
  CONTAINER_NAME,
  buildCountQuery,
  parseCountOutput,
  findLatestBackupFile,
} = require('../../../../scripts/db-restore-verify.js');

describe('Operaciones y Copias de Seguridad (feat/ops-backups)', () => {
  describe('1. Validación de variables y sanitización de credenciales', () => {
    it('validateBackupEnvironment debe fallar si BACKUP_DATABASE_URL no está configurada', () => {
      assert.throws(
        () => validateBackupEnvironment({}),
        /BACKUP_DATABASE_URL no está configurada/,
      );

      assert.throws(
        () => validateBackupEnvironment({ BACKUP_DATABASE_URL: '   ' }),
        /BACKUP_DATABASE_URL no está configurada/,
      );
    });

    it('validateBackupEnvironment debe retornar la URL si está presente y no fugar secretos', () => {
      const testUrl = 'postgresql://vet_admin:Secret123@neon.tech:5432/vet_app_db?sslmode=require';
      const result = validateBackupEnvironment({ BACKUP_DATABASE_URL: testUrl });
      assert.strictEqual(result, testUrl);
    });

    it('sanitizeDatabaseUrl debe enmascarar contraseñas en URLs de base de datos', () => {
      const raw = 'postgresql://admin_user:UltraSecretPass987!@ep-demo-1234.us-east-2.aws.neon.tech:5432/vet_db?sslmode=require';
      const sanitized = sanitizeDatabaseUrl(raw);

      assert.doesNotMatch(sanitized, /UltraSecretPass987!/, 'La contraseña en texto claro NUNCA debe aparecer');
      assert.match(sanitized, /admin_user:\*\*\*@ep-demo-1234/, 'Debe reemplazar la contraseña por asteriscos');
      assert.match(sanitized, /vet_db\?sslmode=require/);
    });

    it('sanitizeDatabaseUrl debe manejar URLs inválidas sin lanzar excepciones', () => {
      assert.strictEqual(sanitizeDatabaseUrl(''), '');
      assert.strictEqual(sanitizeDatabaseUrl('not a valid url ::: /'), '[REDACTED_URL]');
    });
  });

  describe('2. Generación de nombres de archivo y directorios seguros', () => {
    it('generateBackupFilename debe producir nombres con formato vetapp-backup-YYYYMMDD-HHmmss.sql.gz', () => {
      const fixedDate = new Date(2026, 10, 9, 21, 30, 45); // Noviembre es mes 10 (0-indexado)
      const filename = generateBackupFilename(fixedDate);

      assert.strictEqual(filename, 'vetapp-backup-20261109-213045.sql.gz');
      assert.match(filename, /^vetapp-backup-\d{8}-\d{6}\.sql\.gz$/);
    });

    it('getBackupDirectory debe residir FUERA del repositorio por defecto', () => {
      const defaultDir = getBackupDirectory();
      const userHome = os.homedir();
      const repoRoot = path.resolve(__dirname, '../../../..');

      assert.strictEqual(defaultDir, path.join(userHome, '.vetapp-backups'));
      assert.notStrictEqual(defaultDir, repoRoot);
      assert.strictEqual(defaultDir.startsWith(repoRoot), false, 'El directorio por defecto debe estar fuera del repo');
    });

    it('resolveDockerHost debe mapear localhost y 127.0.0.1 a host.docker.internal para pruebas', () => {
      const local1 = resolveDockerHost('postgresql://user:pass@localhost:5432/db');
      assert.match(local1, /host\.docker\.internal:5432/);

      const local2 = resolveDockerHost('postgresql://user:pass@127.0.0.1:5433/db');
      assert.match(local2, /host\.docker\.internal:5433/);

      const cloud = resolveDockerHost('postgresql://user:pass@ep-cloud.neon.tech:5432/db');
      assert.match(cloud, /ep-cloud\.neon\.tech:5432/, 'No debe alterar endpoints de Neon en la nube');
    });

    it('POSTGRES_IMAGE debe coincidir con la versión oficial 16 de Neon', () => {
      assert.strictEqual(POSTGRES_IMAGE, 'postgres:16-alpine');
    });
  });

  describe('3. Verificación de restauración y consultas de tablas clave', () => {
    it('KEY_TABLES debe incluir todas las entidades clínicas y de auditoría del sistema', () => {
      const expected = [
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
      for (const t of expected) {
        assert.ok(KEY_TABLES.includes(t), `KEY_TABLES debe incluir "${t}"`);
      }
    });

    it('buildCountQuery debe generar un UNION ALL sintácticamente correcto para todas las tablas', () => {
      const query = buildCountQuery(['clinics', 'pets']);
      assert.ok(query.includes(`SELECT 'clinics' AS tabla, count(*)::int AS total FROM "clinics"`));
      assert.ok(query.includes(`UNION ALL`));
      assert.ok(query.includes(`SELECT 'pets' AS tabla, count(*)::int AS total FROM "pets"`));
      assert.ok(query.endsWith(';'));
    });

    it('parseCountOutput debe convertir la salida delimitada por barra en un objeto de conteos', () => {
      const mockPsqlOutput = `
clinics|2
users|4
owners|10
pets|12
tags|8
visits|15
access_logs|45
access_grants|6
notifications|3
`;
      const counts = parseCountOutput(mockPsqlOutput);

      assert.strictEqual(counts.clinics, 2);
      assert.strictEqual(counts.users, 4);
      assert.strictEqual(counts.owners, 10);
      assert.strictEqual(counts.pets, 12);
      assert.strictEqual(counts.tags, 8);
      assert.strictEqual(counts.visits, 15);
      assert.strictEqual(counts.access_logs, 45);
      assert.strictEqual(counts.access_grants, 6);
      assert.strictEqual(counts.notifications, 3);
    });

    it('findLatestBackupFile debe retornar null si la carpeta no existe o está vacía', () => {
      const emptyDir = path.join(os.tmpdir(), `vetapp-test-empty-${Date.now()}`);
      try {
        fs.mkdirSync(emptyDir, { recursive: true });
        assert.strictEqual(findLatestBackupFile(emptyDir), null);
      } finally {
        try { fs.rmdirSync(emptyDir); } catch {}
      }
    });

    it('findLatestBackupFile debe ordenar descendentemente y retornar el archivo más reciente', () => {
      const tempDir = path.join(os.tmpdir(), `vetapp-test-backups-${Date.now()}`);
      try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'vetapp-backup-20261101-100000.sql.gz'), 'test1');
        fs.writeFileSync(path.join(tempDir, 'vetapp-backup-20261109-180000.sql.gz'), 'test2');
        fs.writeFileSync(path.join(tempDir, 'vetapp-backup-20261105-120000.sql.gz'), 'test3');

        const latest = findLatestBackupFile(tempDir);
        assert.ok(latest);
        assert.strictEqual(path.basename(latest), 'vetapp-backup-20261109-180000.sql.gz');
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('constantes de base de datos temporal deben ser seguras y consistentes', () => {
      assert.strictEqual(TEMP_DB_NAME, 'vet_app_restore_verify');
      assert.strictEqual(CONTAINER_NAME, 'vet_app_postgres');
    });
  });

  describe('4. Auditoría de configuración de repositorios y CI/CD', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');

    it('.gitignore debe excluir de forma estricta los directorios de backup y volcados sql', () => {
      const gitignorePath = path.join(repoRoot, '.gitignore');
      assert.ok(fs.existsSync(gitignorePath));
      const content = fs.readFileSync(gitignorePath, 'utf8');

      assert.match(content, /backups\//);
      assert.match(content, /\.vetapp-backups\//);
      assert.match(content, /\*\.sql\.gz/);
      assert.match(content, /\*\.sql/);
    });

    it('.github/dependabot.yml debe existir, estar agrupado y programado semanalmente', () => {
      const dependabotPath = path.join(repoRoot, '.github/dependabot.yml');
      assert.ok(fs.existsSync(dependabotPath), 'Debe existir .github/dependabot.yml');
      const content = fs.readFileSync(dependabotPath, 'utf8');

      assert.match(content, /package-ecosystem:\s*"npm"/);
      assert.match(content, /package-ecosystem:\s*"github-actions"/);
      assert.match(content, /interval:\s*"weekly"/);
      assert.match(content, /groups:/);
    });

    it('.github/workflows/ci.yml debe incluir job audit informativo (continue-on-error)', () => {
      const ciPath = path.join(repoRoot, '.github/workflows/ci.yml');
      assert.ok(fs.existsSync(ciPath));
      const content = fs.readFileSync(ciPath, 'utf8');

      assert.match(content, /audit:/);
      assert.match(content, /pnpm audit \|\| true/);
      assert.match(content, /continue-on-error:\s*true/);
    });

    it('package.json debe registrar scripts db:backup y db:restore:verify', () => {
      const packageJsonPath = path.join(repoRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      assert.strictEqual(pkg.scripts['db:backup'], 'node scripts/db-backup.js');
      assert.strictEqual(pkg.scripts['db:restore:verify'], 'node scripts/db-restore-verify.js');
    });
  });
});
