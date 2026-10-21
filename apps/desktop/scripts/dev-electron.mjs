import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');

console.log('[dev:electron] Compilando proceso principal de Electron...');

const isWindows = process.platform === 'win32';
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

// 1. Compilar proceso principal
const buildProc = spawn(pnpmCmd, ['build:electron'], {
  cwd: desktopDir,
  stdio: 'inherit',
});

buildProc.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[dev:electron] Error al compilar electron (código ${code})`);
    process.exit(code || 1);
  }

  console.log('[dev:electron] Iniciando servidor Vite...');

  // 2. Levantar Vite
  const viteProc = spawn(pnpmCmd, ['exec', 'vite'], {
    cwd: desktopDir,
    stdio: 'inherit',
  });

  const checkViteReady = (retries = 60) => {
    if (retries <= 0) {
      console.error('[dev:electron] Tiempo de espera agotado esperando a Vite');
      viteProc.kill();
      process.exit(1);
    }

    const req = http.get('http://localhost:5173', () => {
      console.log('[dev:electron] Vite listo en http://localhost:5173. Levantando Electron...');
      launchElectron(viteProc);
    });

    req.on('error', () => {
      setTimeout(() => checkViteReady(retries - 1), 500);
    });
  };

  const launchElectron = (viteChild) => {
    const electronProc = spawn(
      pnpmCmd,
      ['exec', 'electron', 'dist-electron/main.js'],
      {
        cwd: desktopDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
      }
    );

    const cleanup = () => {
      try {
        viteChild.kill();
      } catch {}
      try {
        electronProc.kill();
      } catch {}
    };

    electronProc.on('exit', (exitCode) => {
      console.log(`[dev:electron] Electron finalizó con código ${exitCode}`);
      cleanup();
      process.exit(exitCode || 0);
    });

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  };

  setTimeout(() => checkViteReady(), 1000);
});
