#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  resolveDevCommands,
  isPortAvailable,
  terminateProcessTree,
} from './dev-command-resolver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');

async function main() {
  console.log('[dev:electron] Comprobando disponibilidad del puerto 5173...');
  const portFree = await isPortAvailable(5173);
  if (!portFree) {
    console.error(
      '\n[dev:electron] ERROR: El puerto 5173 ya se encuentra ocupado por otro proceso.\n' +
      'Asegúrese de cerrar cualquier instancia previa de Vite o aplicación que use este puerto antes de iniciar dev:electron.\n'
    );
    process.exit(1);
  }

  const commands = resolveDevCommands({
    cwd: desktopDir,
    platform: process.platform,
    execPath: process.execPath,
  });

  console.log('[dev:electron] Compilando proceso principal de Electron...');

  // 1. Compilar proceso principal (tsc)
  const buildProc = spawn(commands.build.command, commands.build.args, {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: commands.build.shell,
  });

  buildProc.on('error', (err) => {
    console.error(`\n[dev:electron] ERROR al lanzar compilador de TypeScript: ${err.message}`);
    process.exit(1);
  });

  buildProc.on('exit', (code) => {
    if (code !== 0) {
      console.error(
        `\n[dev:electron] ERROR: La compilación del proceso principal de Electron falló con código ${code}.\n` +
        'Revise los errores de TypeScript mostrados arriba antes de continuar.\n'
      );
      process.exit(code || 1);
    }

    // Copiar archivos de dist-electron/electron a dist-electron si existen
    const srcDir = path.join(desktopDir, 'dist-electron', 'electron');
    const destDir = path.join(desktopDir, 'dist-electron');
    if (fs.existsSync(srcDir)) {
      try {
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      } catch (copyErr) {
        console.warn(`[dev:electron] Advertencia al sincronizar dist-electron: ${copyErr.message}`);
      }
    }

    console.log('[dev:electron] Iniciando servidor Vite...');

    // 2. Levantar Vite
    let isViteReady = false;
    let viteKilled = false;

    const viteProc = spawn(commands.vite.command, commands.vite.args, {
      cwd: desktopDir,
      stdio: 'inherit',
      shell: commands.vite.shell,
      env: {
        ...process.env,
      },
    });

    const cleanup = () => {
      if (viteKilled) return;
      viteKilled = true;
      if (viteProc.pid) {
        terminateProcessTree(viteProc.pid);
      }
      try {
        viteProc.kill();
      } catch {}
    };

    viteProc.on('error', (err) => {
      console.error(`\n[dev:electron] ERROR al iniciar Vite: ${err.message}`);
      cleanup();
      process.exit(1);
    });

    viteProc.on('exit', (code) => {
      if (!isViteReady && !viteKilled) {
        console.error(`\n[dev:electron] ERROR: El servidor Vite finalizó inesperadamente con código ${code}.`);
        cleanup();
        process.exit(code || 1);
      }
    });

    // 3. Esperar a que Vite responda en http://localhost:5173
    const checkViteReady = (retries = 60) => {
      if (retries <= 0) {
        console.error('\n[dev:electron] ERROR: Tiempo de espera agotado esperando a que Vite responda en http://localhost:5173.');
        cleanup();
        process.exit(1);
      }

      const req = http.get('http://localhost:5173', () => {
        isViteReady = true;
        console.log('[dev:electron] Vite listo en http://localhost:5173. Levantando Electron...');
        launchElectron();
      });

      req.on('error', () => {
        if (!viteKilled) {
          setTimeout(() => checkViteReady(retries - 1), 500);
        }
      });
    };

    // 4. Lanzar Electron
    const launchElectron = () => {
      const electronProc = spawn(commands.electron.command, commands.electron.args, {
        cwd: desktopDir,
        stdio: 'inherit',
        shell: commands.electron.shell,
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
      });

      electronProc.on('error', (err) => {
        console.error(`\n[dev:electron] ERROR al lanzar Electron: ${err.message}`);
        cleanup();
        process.exit(1);
      });

      electronProc.on('exit', (exitCode) => {
        console.log(`[dev:electron] Ventana de Electron cerrada (código ${exitCode}). Finalizando procesos...`);
        cleanup();
        process.exit(exitCode || 0);
      });

      process.on('SIGINT', () => {
        console.log('\n[dev:electron] Interrupción recibida (SIGINT). Limpiando...');
        try {
          electronProc.kill();
        } catch {}
        cleanup();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n[dev:electron] Terminación recibida (SIGTERM). Limpiando...');
        try {
          electronProc.kill();
        } catch {}
        cleanup();
        process.exit(0);
      });

      process.on('exit', () => {
        cleanup();
      });
    };

    setTimeout(() => checkViteReady(), 1000);
  });
}

main().catch((err) => {
  console.error(`\n[dev:electron] Error fatal no controlado: ${err.message}`);
  process.exit(1);
});
