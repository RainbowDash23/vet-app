import { describe, it, expect } from 'vitest';
import net from 'node:net';
import path from 'node:path';
import {
  resolveDevCommands,
  isPortAvailable,
  terminateProcessTree,
} from '../../scripts/dev-command-resolver.mjs';

describe('Herramientas de Desarrollo: dev-command-resolver (Windows / Node 20.12+)', () => {
  describe('resolveDevCommands', () => {
    it('en process.platform === "win32", ningún comando generado debe usar archivos .cmd o .bat', () => {
      const commands = resolveDevCommands({
        platform: 'win32',
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
      });

      // 1. Verificación de compilar proceso principal (TypeScript)
      expect(commands.build.command).not.toMatch(/\.(cmd|bat)$/i);
      expect(commands.build.command).not.toContain('pnpm.cmd');
      expect(commands.build.command).not.toContain('npx.cmd');
      expect(commands.build.command).toBe('C:\\Program Files\\nodejs\\node.exe');
      expect(commands.build.args[0]).toMatch(/tsc(\.js)?$/);
      expect(commands.build.args).toContain('-p');
      expect(commands.build.args).toContain('tsconfig.electron.json');
      expect(commands.build.shell).toBe(false);

      // 2. Verificación de servidor Vite
      expect(commands.vite.command).not.toMatch(/\.(cmd|bat)$/i);
      expect(commands.vite.command).not.toContain('pnpm.cmd');
      expect(commands.vite.command).not.toContain('npx.cmd');
      expect(commands.vite.command).toBe('C:\\Program Files\\nodejs\\node.exe');
      expect(commands.vite.args[0]).toMatch(/vite(\.js)?$/);
      expect(commands.vite.shell).toBe(false);

      // 3. Verificación de proceso Electron
      expect(commands.electron.command).not.toMatch(/\.(cmd|bat)$/i);
      expect(commands.electron.command).not.toContain('pnpm.cmd');
      expect(commands.electron.command).not.toContain('electron.cmd');
      // Debe ser el binario .exe nativo o process.execPath (node.exe)
      expect(commands.electron.command).toMatch(/\.(exe)$|node\.exe$/i);
      expect(commands.electron.args).toContain('dist-electron/main.js');
      expect(commands.electron.shell).toBe(false);
    });

    it('en plataformas POSIX (linux/darwin), genera comandos consistentes con shell: false', () => {
      const commands = resolveDevCommands({
        platform: 'linux',
        execPath: '/usr/local/bin/node',
      });

      expect(commands.build.command).toBe('/usr/local/bin/node');
      expect(commands.build.shell).toBe(false);
      expect(commands.vite.command).toBe('/usr/local/bin/node');
      expect(commands.vite.shell).toBe(false);
      expect(commands.electron.shell).toBe(false);
    });

    it('utiliza fallback a electron/cli.js si require("electron") no retorna una ruta ejecutable directa', () => {
      const mockRequire = ((specifier: string) => {
        if (specifier === 'electron') {
          return null; // Simulamos que no exporta string binario
        }
        if (specifier === 'typescript/package.json') {
          return { bin: { tsc: 'bin/tsc' } };
        }
        if (specifier === 'vite/package.json') {
          return { bin: { vite: 'bin/vite.js' } };
        }
        return {};
      }) as unknown as NodeRequire;

      mockRequire.resolve = ((specifier: string) => {
        if (specifier === 'electron/cli.js') {
          return 'C:\\virtual\\node_modules\\electron\\cli.js';
        }
        if (specifier === 'typescript/package.json') {
          return 'C:\\virtual\\node_modules\\typescript\\package.json';
        }
        if (specifier === 'vite/package.json') {
          return 'C:\\virtual\\node_modules\\vite\\package.json';
        }
        return specifier;
      }) as unknown as RequireResolve;

      const commands = resolveDevCommands({
        platform: 'win32',
        execPath: 'C:\\nodejs\\node.exe',
        require: mockRequire,
      });

      expect(commands.electron.command).toBe('C:\\nodejs\\node.exe');
      expect(commands.electron.command).not.toMatch(/\.cmd$/i);
      expect(commands.electron.args[0]).toBe('C:\\virtual\\node_modules\\electron\\cli.js');
      expect(commands.electron.args).toContain('dist-electron/main.js');
      expect(commands.electron.shell).toBe(false);
    });
  });

  describe('isPortAvailable', () => {
    it('retorna true para un puerto libre', async () => {
      // Usar un puerto alto efímero
      const available = await isPortAvailable(59123);
      expect(available).toBe(true);
    });

    it('retorna false cuando un servidor TCP ya está escuchando en dicho puerto', async () => {
      const testPort = 59124;
      const dummyServer = net.createServer();

      await new Promise<void>((resolve) => {
        dummyServer.listen(testPort, '127.0.0.1', () => resolve());
      });

      try {
        const available = await isPortAvailable(testPort);
        expect(available).toBe(false);
      } finally {
        await new Promise<void>((resolve) => {
          dummyServer.close(() => resolve());
        });
      }
    });
  });

  describe('terminateProcessTree', () => {
    it('ignora llamadas con PIDs inválidos o nulos sin lanzar excepción', () => {
      expect(() => terminateProcessTree(0)).not.toThrow();
      expect(() => terminateProcessTree(undefined as unknown as number)).not.toThrow();
      expect(() => terminateProcessTree(null as unknown as number)).not.toThrow();
    });
  });
});
