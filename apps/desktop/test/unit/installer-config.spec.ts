import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readBmpDimensions(buffer: Buffer): { width: number; height: number; bitsPerPixel: number } {
  // BMP Header signature 'BM' (0x42, 0x4D)
  assert.strictEqual(buffer.toString('ascii', 0, 2), 'BM', 'Firma BMP inválida');
  const width = buffer.readInt32LE(18);
  const height = Math.abs(buffer.readInt32LE(22));
  const bitsPerPixel = buffer.readUInt16LE(28);
  return { width, height, bitsPerPixel };
}

describe('Configuración del Asistente NSIS y Reglas de Empaquetado (SPEC EARS)', () => {
  const desktopRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(desktopRoot, '../..');
  const builderYmlPath = path.join(desktopRoot, 'electron-builder.yml');
  const installerNshPath = path.join(desktopRoot, 'build/installer.nsh');

  it('electron-builder.yml debe existir y estar configurado como asistente por pasos sin UAC (per-user)', () => {
    assert.ok(fs.existsSync(builderYmlPath), 'electron-builder.yml no existe');
    const content = fs.readFileSync(builderYmlPath, 'utf8');

    // oneClick debe ser false para activar el asistente interactivo
    assert.match(content, /oneClick:\s*false/, 'oneClick debe ser false');

    // allowToChangeInstallationDirectory debe ser true
    assert.match(content, /allowToChangeInstallationDirectory:\s*true/, 'allowToChangeInstallationDirectory debe ser true');

    // perMachine y allowElevation deben ser false (instalación por usuario sin requerir elevación/UAC)
    assert.match(content, /perMachine:\s*false/, 'perMachine debe ser false');
    assert.match(content, /allowElevation:\s*false/, 'allowElevation debe ser false');

    // Idioma en español y sin selector de idiomas
    assert.match(content, /language:\s*1034/, 'language debe ser 1034 (español)');
    assert.match(content, /installerLanguages:\s*\n\s*-\s*es_ES/, 'installerLanguages debe incluir es_ES');
    assert.match(content, /displayLanguageSelector:\s*false/, 'displayLanguageSelector debe ser false');

    // runAfterFinish configurable en página final
    assert.match(content, /runAfterFinish:\s*true/, 'runAfterFinish debe ser true');

    // Referencias a gráficos y script de personalización
    assert.match(content, /installerSidebar:\s*build\/installerSidebar\.bmp/);
    assert.match(content, /uninstallerSidebar:\s*build\/uninstallerSidebar\.bmp/);
    assert.match(content, /installerHeader:\s*build\/installerHeader\.bmp/);
    assert.match(content, /include:\s*build\/installer\.nsh/);
  });

  it('las imágenes BMP del asistente deben existir con dimensiones y formatos válidos (164x314 y 150x57, 24bpp)', () => {
    const installerSidebarPath = path.join(desktopRoot, 'build/installerSidebar.bmp');
    const uninstallerSidebarPath = path.join(desktopRoot, 'build/uninstallerSidebar.bmp');
    const installerHeaderPath = path.join(desktopRoot, 'build/installerHeader.bmp');

    assert.ok(fs.existsSync(installerSidebarPath), 'installerSidebar.bmp debe existir');
    assert.ok(fs.existsSync(uninstallerSidebarPath), 'uninstallerSidebar.bmp debe existir');
    assert.ok(fs.existsSync(installerHeaderPath), 'installerHeader.bmp debe existir');

    const sidebar = readBmpDimensions(fs.readFileSync(installerSidebarPath));
    assert.strictEqual(sidebar.width, 164, 'installerSidebar.bmp debe tener 164px de ancho');
    assert.strictEqual(sidebar.height, 314, 'installerSidebar.bmp debe tener 314px de alto');
    assert.strictEqual(sidebar.bitsPerPixel, 24, 'installerSidebar.bmp debe ser de 24 bits por pixel');

    const uninstallerSidebar = readBmpDimensions(fs.readFileSync(uninstallerSidebarPath));
    assert.strictEqual(uninstallerSidebar.width, 164, 'uninstallerSidebar.bmp debe tener 164px de ancho');
    assert.strictEqual(uninstallerSidebar.height, 314, 'uninstallerSidebar.bmp debe tener 314px de alto');
    assert.strictEqual(uninstallerSidebar.bitsPerPixel, 24, 'uninstallerSidebar.bmp debe ser de 24 bits por pixel');

    const header = readBmpDimensions(fs.readFileSync(installerHeaderPath));
    assert.strictEqual(header.width, 150, 'installerHeader.bmp debe tener 150px de ancho');
    assert.strictEqual(header.height, 57, 'installerHeader.bmp debe tener 57px de alto');
    assert.strictEqual(header.bitsPerPixel, 24, 'installerHeader.bmp debe ser de 24 bits por pixel');
  });

  it('build/installer.nsh debe definir las macros de páginas, casillas y limpieza de registro sin URLs ni secretos', () => {
    assert.ok(fs.existsSync(installerNshPath), 'installer.nsh debe existir');
    const script = fs.readFileSync(installerNshPath, 'utf8');

    // Macros requeridas
    assert.match(script, /!macro customWelcomePage/, 'Debe definir customWelcomePage');
    assert.match(script, /!macro customPageAfterChangeDir/, 'Debe definir customPageAfterChangeDir');
    assert.match(script, /!macro customInstall/, 'Debe definir customInstall');
    assert.match(script, /!macro customUnWelcomePage/, 'Debe definir customUnWelcomePage');
    assert.match(script, /!macro customUnInstall/, 'Debe definir customUnInstall');

    // Casillas requeridas
    assert.ok(
      script.includes('Crear acceso directo en el escritorio'),
      'Debe contener la casilla "Crear acceso directo en el escritorio"',
    );
    assert.ok(
      script.includes('Iniciar VetApp al arrancar Windows'),
      'Debe contener la casilla "Iniciar VetApp al arrancar Windows"',
    );
    assert.ok(
      script.includes('Eliminar datos de usuario'),
      'Debe contener la opción "Eliminar datos de usuario"',
    );

    // Clave de registro para inicio automático en HKCU Run
    assert.ok(
      script.includes('Software\\Microsoft\\Windows\\CurrentVersion\\Run'),
      'Debe gestionar la clave de registro HKCU Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    );
    assert.ok(
      script.includes('DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "VetApp"'),
      'El desinstalador debe eliminar la clave de registro de auto-inicio',
    );

    // Cero URLs de API hardcodeadas ni secretos
    assert.ok(!script.includes('http://'), 'installer.nsh no debe contener URLs http');
    assert.ok(!script.includes('https://'), 'installer.nsh no debe contener URLs https');
    assert.ok(!script.includes('localhost'), 'installer.nsh no debe contener referencias a localhost');
  });

  it('no debe incluir página de licencia si no existe archivo LICENSE en el repositorio', () => {
    const licenseExists =
      fs.existsSync(path.join(repoRoot, 'LICENSE')) ||
      fs.existsSync(path.join(repoRoot, 'LICENSE.md')) ||
      fs.existsSync(path.join(repoRoot, 'LICENSE.txt'));

    const builderYml = fs.readFileSync(builderYmlPath, 'utf8');
    if (!licenseExists) {
      assert.ok(!builderYml.includes('license:'), 'No debe haber directiva license en electron-builder.yml sin archivo LICENSE');
    }
  });
});
