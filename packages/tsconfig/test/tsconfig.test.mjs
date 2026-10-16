import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '../..');

describe('T01: @vet-app/tsconfig Centralized Strict TypeScript Configuration', () => {
  const baseJsonPath = path.join(pkgDir, 'base.json');
  const nestJsonPath = path.join(pkgDir, 'nest.json');
  const reactJsonPath = path.join(pkgDir, 'react.json');
  const packageJsonPath = path.join(pkgDir, 'package.json');

  test('package.json exists and defines @vet-app/tsconfig package metadata', () => {
    assert.ok(fs.existsSync(packageJsonPath), 'package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.equal(pkg.name, '@vet-app/tsconfig');
    assert.ok(Array.isArray(pkg.files), 'package.json must specify files array');
    assert.ok(pkg.files.includes('base.json'), 'files must include base.json');
    assert.ok(pkg.files.includes('nest.json'), 'files must include nest.json');
    assert.ok(pkg.files.includes('react.json'), 'files must include react.json');
  });

  test('base.json exists and enforces strict compiler options (RNF-1 & Constitution Principle 4)', () => {
    assert.ok(fs.existsSync(baseJsonPath), 'base.json must exist');
    const base = JSON.parse(fs.readFileSync(baseJsonPath, 'utf8'));
    const opts = base.compilerOptions;
    assert.ok(opts, 'base.json must have compilerOptions');

    // Constitutional & task requirements
    assert.equal(opts.strict, true, 'strict must be true');
    assert.equal(opts.noImplicitAny, true, 'noImplicitAny must be true');
    assert.equal(opts.strictNullChecks, true, 'strictNullChecks must be true');
    assert.equal(opts.noUnusedLocals, true, 'noUnusedLocals must be true');
    assert.equal(opts.noUnusedParameters, true, 'noUnusedParameters must be true');
    assert.equal(opts.strictBindCallApply, true, 'strictBindCallApply must be true');
    assert.equal(opts.forceConsistentCasingInFileNames, true, 'forceConsistentCasingInFileNames must be true');
    assert.equal(opts.noFallthroughCasesInSwitch, true, 'noFallthroughCasesInSwitch must be true');
  });

  test('nest.json exists, extends base.json, and configures NestJS decorators and module options', () => {
    assert.ok(fs.existsSync(nestJsonPath), 'nest.json must exist');
    const nest = JSON.parse(fs.readFileSync(nestJsonPath, 'utf8'));
    assert.equal(nest.extends, './base.json', 'nest.json must extend ./base.json');
    const opts = nest.compilerOptions;
    assert.ok(opts, 'nest.json must have compilerOptions');
    assert.equal(opts.emitDecoratorMetadata, true, 'emitDecoratorMetadata must be true');
    assert.equal(opts.experimentalDecorators, true, 'experimentalDecorators must be true');
  });

  test('react.json exists, extends base.json, and configures React JSX options', () => {
    assert.ok(fs.existsSync(reactJsonPath), 'react.json must exist');
    const react = JSON.parse(fs.readFileSync(reactJsonPath, 'utf8'));
    assert.equal(react.extends, './base.json', 'react.json must extend ./base.json');
    const opts = react.compilerOptions;
    assert.ok(opts, 'react.json must have compilerOptions');
    assert.equal(opts.jsx, 'react-jsx', 'jsx must be react-jsx');
  });

  test('TypeScript compilation of nest fixture extending nest.json succeeds', () => {
    const fixturePath = path.join(pkgDir, 'test/fixtures/nest-app/tsconfig.json');
    assert.ok(fs.existsSync(fixturePath), 'nest fixture tsconfig must exist');

    const result = execSync(`pnpm --filter @vet-app/api exec tsc -p ${fixturePath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    assert.equal(result.trim(), '', 'Compilation of NestJS fixture should succeed with no output');
  });

  test('TypeScript compilation of react fixture extending react.json succeeds', () => {
    const fixturePath = path.join(pkgDir, 'test/fixtures/react-app/tsconfig.json');
    assert.ok(fs.existsSync(fixturePath), 'react fixture tsconfig must exist');

    const result = execSync(`pnpm --filter @vet-app/api exec tsc -p ${fixturePath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    assert.equal(result.trim(), '', 'Compilation of React fixture should succeed with no output');
  });

  test('Strict mode rejects unused local variables (verifying noUnusedLocals enforcement)', () => {
    const tempTsPath = path.join(pkgDir, 'test/fixtures/nest-app/src/temp-unused.ts');
    fs.writeFileSync(tempTsPath, 'export function testUnused(): void { const unusedVar = 42; }', 'utf8');

    const fixturePath = path.join(pkgDir, 'test/fixtures/nest-app/tsconfig.json');
    try {
      assert.throws(
        () => {
          execSync(`pnpm --filter @vet-app/api exec tsc -p ${fixturePath}`, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: 'pipe'
          });
        },
        (err) => {
          const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
          return /TS6133/.test(output);
        },
        'Should fail compilation with TS6133 for unused local variable'
      );
    } finally {
      if (fs.existsSync(tempTsPath)) {
        fs.unlinkSync(tempTsPath);
      }
    }
  });

  test('Strict mode rejects implicit any (verifying noImplicitAny enforcement)', () => {
    const tempTsPath = path.join(pkgDir, 'test/fixtures/nest-app/src/temp-any.ts');
    fs.writeFileSync(tempTsPath, 'export function testImplicitAny(param) { return param; }', 'utf8');

    const fixturePath = path.join(pkgDir, 'test/fixtures/nest-app/tsconfig.json');
    try {
      assert.throws(
        () => {
          execSync(`pnpm --filter @vet-app/api exec tsc -p ${fixturePath}`, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: 'pipe'
          });
        },
        (err) => {
          const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
          return /TS7006/.test(output);
        },
        'Should fail compilation with TS7006 for implicit any parameter'
      );
    } finally {
      if (fs.existsSync(tempTsPath)) {
        fs.unlinkSync(tempTsPath);
      }
    }
  });
});
