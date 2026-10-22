import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

/**
 * Resuelve los comandos y argumentos necesarios para arrancar el entorno de desarrollo
 * de Electron en cualquier sistema operativo (Windows, Linux, macOS) sin invocar
 * directamente scripts .cmd o .bat a través de child_process.spawn (mitigación CVE-2024-27980 / Node 20.12+).
 *
 * @param {Object} [options]
 * @param {string} [options.platform] - Plataforma de ejecución ('win32', 'linux', 'darwin'). Por defecto process.platform.
 * @param {string} [options.execPath] - Ruta al binario de Node. Por defecto process.execPath.
 * @param {string} [options.cwd] - Directorio base para resolución de módulos. Por defecto process.cwd().
 * @param {Function} [options.require] - Función require custom para pruebas unitarias.
 * @returns {{
 *   build: { command: string, args: string[], shell: boolean },
 *   vite: { command: string, args: string[], shell: boolean },
 *   electron: { command: string, args: string[], shell: boolean }
 * }}
 */
export function resolveDevCommands(options = {}) {
  const platform = options.platform || process.platform;
  const execPath = options.execPath || process.execPath;
  const cwd = options.cwd || process.cwd();
  const req = options.require || createRequire(import.meta.url);

  // 1. Resolver TypeScript CLI entrypoint
  let tscBinPath;
  try {
    const tscPkgPath = req.resolve('typescript/package.json', { paths: [cwd] });
    const tscPkg = req(tscPkgPath);
    const tscRel = typeof tscPkg.bin === 'string' ? tscPkg.bin : (tscPkg.bin?.tsc || 'bin/tsc');
    tscBinPath = path.resolve(path.dirname(tscPkgPath), tscRel);
  } catch {
    tscBinPath = req.resolve('typescript/bin/tsc', { paths: [cwd] });
  }

  // 2. Resolver Vite CLI entrypoint
  let viteBinPath;
  try {
    const vitePkgPath = req.resolve('vite/package.json', { paths: [cwd] });
    const vitePkg = req(vitePkgPath);
    const viteRel = typeof vitePkg.bin === 'string' ? vitePkg.bin : (vitePkg.bin?.vite || 'bin/vite.js');
    viteBinPath = path.resolve(path.dirname(vitePkgPath), viteRel);
  } catch {
    viteBinPath = req.resolve('vite/bin/vite.js', { paths: [cwd] });
  }

  // 3. Resolver binario de Electron o CLI entrypoint
  let electronCommand = execPath;
  let electronArgs = [];
  try {
    const electronBinary = req('electron');
    if (typeof electronBinary === 'string' && electronBinary.length > 0) {
      electronCommand = electronBinary;
      electronArgs = ['dist-electron/main.js'];
    } else {
      const cliPath = req.resolve('electron/cli.js', { paths: [cwd] });
      electronCommand = execPath;
      electronArgs = [cliPath, 'dist-electron/main.js'];
    }
  } catch {
    try {
      const cliPath = req.resolve('electron/cli.js', { paths: [cwd] });
      electronCommand = execPath;
      electronArgs = [cliPath, 'dist-electron/main.js'];
    } catch {
      electronCommand = platform === 'win32' ? execPath : 'electron';
      electronArgs = ['dist-electron/main.js'];
    }
  }

  return {
    build: {
      command: execPath,
      args: [tscBinPath, '-p', 'tsconfig.electron.json'],
      shell: false,
    },
    vite: {
      command: execPath,
      args: [viteBinPath],
      shell: false,
    },
    electron: {
      command: electronCommand,
      args: electronArgs,
      shell: false,
    },
  };
}

/**
 * Comprueba si un puerto TCP está disponible para ser escuchado.
 *
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @returns {Promise<boolean>}
 */
export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * Termina un árbol completo de procesos de forma segura según el sistema operativo.
 * En Windows utiliza taskkill.exe /pid /T /F para asegurar que ningún subproceso retenga el puerto.
 *
 * @param {number} pid
 * @param {Object} [options]
 * @param {string} [options.platform]
 */
export function terminateProcessTree(pid, options = {}) {
  if (!pid || typeof pid !== 'number') return;
  const platform = options.platform || process.platform;

  if (platform === 'win32') {
    try {
      spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // Ignorar si el proceso ya terminó
    }
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignorar si el proceso ya terminó
    }
  }
}
