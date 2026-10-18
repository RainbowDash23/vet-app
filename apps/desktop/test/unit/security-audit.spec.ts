import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findRepoRoot(startDir = process.cwd()): string {
  let cur = path.resolve(startDir);
  while (cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();

function getFilesRecursively(dir: string, filterExts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFilesRecursively(fullPath, filterExts));
    } else if (entry.isFile()) {
      if (filterExts.length === 0 || filterExts.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

describe('Auditoría Estática de Seguridad, Compilación Estricta y Bundle sin Secretos (T38 / RNF-1, RNF-2, RNF-3, RNF-6)', () => {
  describe('RNF-1: Compilación Estricta en TypeScript y Cero Directivas @ts-ignore', () => {
    it('todos los tsconfig del monorepo deben configurar strict: true y noImplicitAny: true (directamente o por herencia)', () => {
      const tsconfigFiles = [
        path.join(REPO_ROOT, 'packages', 'tsconfig', 'base.json'),
        path.join(REPO_ROOT, 'packages', 'tsconfig', 'nest.json'),
        path.join(REPO_ROOT, 'packages', 'tsconfig', 'react.json'),
        path.join(REPO_ROOT, 'packages', 'shared-types', 'tsconfig.json'),
        path.join(REPO_ROOT, 'apps', 'api', 'tsconfig.json'),
        path.join(REPO_ROOT, 'apps', 'desktop', 'tsconfig.json'),
        path.join(REPO_ROOT, 'apps', 'desktop', 'tsconfig.electron.json'),
      ];

      const baseJsonPath = path.join(REPO_ROOT, 'packages', 'tsconfig', 'base.json');
      assert.ok(fs.existsSync(baseJsonPath), 'packages/tsconfig/base.json debe existir');
      const baseContent = JSON.parse(fs.readFileSync(baseJsonPath, 'utf-8'));
      assert.strictEqual(
        baseContent.compilerOptions?.strict,
        true,
        'base.json debe definir strict: true',
      );
      assert.strictEqual(
        baseContent.compilerOptions?.noImplicitAny,
        true,
        'base.json debe definir noImplicitAny: true',
      );

      for (const filePath of tsconfigFiles) {
        assert.ok(fs.existsSync(filePath), `El archivo tsconfig ${filePath} debe existir`);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const options = content.compilerOptions ?? {};

        if (content.extends) {
          // Si hereda de base.json o react/nest, strict y noImplicitAny provienen de base.json a menos que se hayan anulado
          if (options.strict !== undefined) {
            assert.strictEqual(options.strict, true, `${filePath} no debe anular strict a false`);
          }
          if (options.noImplicitAny !== undefined) {
            assert.strictEqual(options.noImplicitAny, true, `${filePath} no debe anular noImplicitAny a false`);
          }
        } else {
          assert.strictEqual(
            options.strict,
            true,
            `${filePath} debe definir compilerOptions.strict = true`,
          );
          assert.strictEqual(
            options.noImplicitAny,
            true,
            `${filePath} debe definir compilerOptions.noImplicitAny = true`,
          );
        }
      }
    });

    it('todos los archivos fuente TypeScript (.ts, .tsx) en el monorepo deben tener CERO directivas @ts-ignore', () => {
      const sourceDirs = [
        path.join(REPO_ROOT, 'packages', 'shared-types', 'src'),
        path.join(REPO_ROOT, 'apps', 'api', 'src'),
        path.join(REPO_ROOT, 'apps', 'desktop', 'src'),
        path.join(REPO_ROOT, 'apps', 'desktop', 'electron'),
      ];

      let totalFilesScanned = 0;
      const violations: { file: string; line: number; text: string }[] = [];

      for (const srcDir of sourceDirs) {
        assert.ok(fs.existsSync(srcDir), `Directorio fuente ${srcDir} debe existir`);
        const files = getFilesRecursively(srcDir, ['.ts', '.tsx']);
        assert.ok(files.length > 0, `El directorio ${srcDir} debe contener archivos .ts/.tsx`);

        for (const file of files) {
          totalFilesScanned++;
          const content = fs.readFileSync(file, 'utf-8');
          if (content.includes('@ts-ignore')) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes('@ts-ignore')) {
                violations.push({
                  file: path.relative(REPO_ROOT, file),
                  line: index + 1,
                  text: line.trim(),
                });
              }
            });
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Se encontraron directivas @ts-ignore prohibidas por la Constitución y RNF-1:\n` +
          violations.map((v) => `  - ${v.file}:${v.line} -> ${v.text}`).join('\n'),
      );
      assert.ok(totalFilesScanned >= 50, `Se escanearon ${totalFilesScanned} archivos TypeScript (mínimo esperado >= 50)`);
    });
  });

  describe('RNF-2: Cero Secretos en Artefactos Cliente y Bundle de Distribución', () => {
    it('los directorios de distribución apps/desktop/dist y apps/desktop/dist-electron deben existir y carecer de credenciales', () => {
      const distDir = path.join(REPO_ROOT, 'apps', 'desktop', 'dist');
      const distElectronDir = path.join(REPO_ROOT, 'apps', 'desktop', 'dist-electron');

      assert.ok(
        fs.existsSync(distDir),
        'apps/desktop/dist debe existir (ejecutar pnpm -r build previamente si es necesario)',
      );
      assert.ok(
        fs.existsSync(distElectronDir),
        'apps/desktop/dist-electron debe existir (ejecutar pnpm -r build previamente si es necesario)',
      );

      const filesToAudit = [
        ...getFilesRecursively(distDir, ['.js', '.mjs', '.cjs', '.html', '.css', '.map']),
        ...getFilesRecursively(distElectronDir, ['.js', '.mjs', '.cjs', '.map']),
      ];

      assert.ok(
        filesToAudit.length >= 3,
        `Se deben haber generado al menos 3 artefactos compilados para auditar (encontrados: ${filesToAudit.length})`,
      );

      const forbiddenSecretPatterns: { name: string; pattern: RegExp }[] = [
        { name: 'URL de PostgreSQL', pattern: /postgres(ql)?:\/\/[a-zA-Z0-9_:@.-]+\/[a-zA-Z0-9_.-]+/i },
        { name: 'URL de MySQL', pattern: /mysql:\/\/[a-zA-Z0-9_:@.-]+\/[a-zA-Z0-9_.-]+/i },
        { name: 'Variable DATABASE_URL', pattern: /DATABASE_URL\s*=\s*['"][^'"]+['"]/i },
        { name: 'JWT Secret asignado', pattern: /JWT_SECRET\s*=\s*['"][^'"]+['"]/i },
        { name: 'Clave privada RSA / EC / PKCS', pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/i },
        { name: 'Certificado privado PEM', pattern: /-----BEGIN CERTIFICATE-----/i },
        { name: 'Credenciales predeterminadas admin/postgres', pattern: /(admin:admin|postgres:postgres)@/i },
      ];

      const detectedSecrets: { file: string; rule: string; match: string }[] = [];

      for (const file of filesToAudit) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const { name, pattern } of forbiddenSecretPatterns) {
          const match = content.match(pattern);
          if (match) {
            detectedSecrets.push({
              file: path.relative(REPO_ROOT, file),
              rule: name,
              match: match[0].substring(0, 40),
            });
          }
        }
      }

      assert.strictEqual(
        detectedSecrets.length,
        0,
        `Se detectaron posibles secretos en artefactos cliente compilados (RNF-2):\n` +
          detectedSecrets.map((s) => `  - [${s.rule}] en ${s.file} (fragmento: "${s.match}")`).join('\n'),
      );
    });
  });

  describe('RNF-3: Arquitectura de Estilos Modular y Accesible sin Tailwind ni shadcn', () => {
    it('apps/desktop/package.json no debe incluir dependencias de Tailwind CSS ni componentes shadcn', () => {
      const desktopPkgPath = path.join(REPO_ROOT, 'apps', 'desktop', 'package.json');
      assert.ok(fs.existsSync(desktopPkgPath), 'apps/desktop/package.json debe existir');

      const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf-8'));
      const allDependencies = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      const forbiddenPackages = [
        'tailwindcss',
        '@tailwindcss/vite',
        '@tailwindcss/postcss',
        '@tailwindcss/typography',
        '@tailwindcss/forms',
        'tailwind-merge',
        'tailwind-variants',
        'clsx',
        '@shadcn/ui',
        'shadcn-ui',
      ];

      const detectedForbidden = forbiddenPackages.filter((pkgName) => pkgName in allDependencies);
      assert.deepStrictEqual(
        detectedForbidden,
        [],
        `apps/desktop no debe contener librerías de Tailwind ni shadcn (RNF-3). Encontrados: ${detectedForbidden.join(', ')}`,
      );
    });

    it('todos los archivos CSS en apps/desktop/src deben usar CSS Modules y no contener directivas @apply ni @tailwind', () => {
      const srcDir = path.join(REPO_ROOT, 'apps', 'desktop', 'src');
      const cssFiles = getFilesRecursively(srcDir, ['.css']);

      assert.ok(
        cssFiles.length >= 8,
        `Se encontraron ${cssFiles.length} archivos CSS en apps/desktop/src (esperados >= 8)`,
      );

      const violations: { file: string; rule: string; line: number; text: string }[] = [];

      for (const cssFile of cssFiles) {
        const content = fs.readFileSync(cssFile, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (/@apply\s+/.test(line)) {
            violations.push({
              file: path.relative(REPO_ROOT, cssFile),
              rule: 'Directiva @apply',
              line: index + 1,
              text: line.trim(),
            });
          }
          if (/@tailwind\s+/.test(line)) {
            violations.push({
              file: path.relative(REPO_ROOT, cssFile),
              rule: 'Directiva @tailwind',
              line: index + 1,
              text: line.trim(),
            });
          }
        });
      }

      assert.strictEqual(
        violations.length,
        0,
        `Se detectaron directivas de Tailwind en estilos CSS de desktop (RNF-3):\n` +
          violations.map((v) => `  - [${v.rule}] en ${v.file}:${v.line} -> "${v.text}"`).join('\n'),
      );
    });
  });

  describe('RNF-6: Aislamiento de Contexto y Seguridad en Electron', () => {
    it('apps/desktop/electron/main.ts debe configurar contextIsolation: true, nodeIntegration: false y sandbox: true', () => {
      const mainTsPath = path.join(REPO_ROOT, 'apps', 'desktop', 'electron', 'main.ts');
      assert.ok(fs.existsSync(mainTsPath), 'apps/desktop/electron/main.ts debe existir');

      const content = fs.readFileSync(mainTsPath, 'utf-8');

      assert.match(
        content,
        /contextIsolation:\s*true/,
        'electron/main.ts debe tener contextIsolation: true obligatorio (RNF-6)',
      );
      assert.match(
        content,
        /nodeIntegration:\s*false/,
        'electron/main.ts debe tener nodeIntegration: false obligatorio (RNF-6)',
      );
      assert.match(
        content,
        /sandbox:\s*true/,
        'electron/main.ts debe tener sandbox: true obligatorio (RNF-6)',
      );
    });

    it('apps/desktop/electron/preload.ts debe exponer API segura mediante contextBridge y nunca ipcRenderer ni módulos Node nativos', () => {
      const preloadTsPath = path.join(REPO_ROOT, 'apps', 'desktop', 'electron', 'preload.ts');
      assert.ok(fs.existsSync(preloadTsPath), 'apps/desktop/electron/preload.ts debe existir');

      const content = fs.readFileSync(preloadTsPath, 'utf-8');

      // Valida uso de contextBridge
      assert.match(
        content,
        /contextBridge\.exposeInMainWorld\s*\(\s*['"]electronAPI['"]/,
        'preload.ts debe usar contextBridge.exposeInMainWorld con la clave electronAPI',
      );

      // Valida ausencia de exposición directa de ipcRenderer o módulos de Node al objeto window
      assert.doesNotMatch(
        content,
        /contextBridge\.exposeInMainWorld\s*\(\s*['"]ipcRenderer['"]/,
        'preload.ts no debe exponer ipcRenderer directamente a window (RNF-6)',
      );
      assert.doesNotMatch(
        content,
        /contextBridge\.exposeInMainWorld\s*\(\s*['"](fs|path|child_process|process)['"]/,
        'preload.ts no debe exponer módulos nativos de Node.js a window (RNF-6)',
      );
      assert.doesNotMatch(
        content,
        /window\.(ipcRenderer|require|process)\s*=/,
        'preload.ts no debe asignar ipcRenderer, require o process a window directamente (RNF-6)',
      );
    });
  });
});
