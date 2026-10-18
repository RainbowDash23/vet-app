import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      const parentDir = fileURLToPath(new URL('.', context.parentURL));
      for (const ext of EXTENSIONS) {
        const candidate = new URL(specifier + ext, context.parentURL);
        const candidatePath = fileURLToPath(candidate);
        if (fs.existsSync(candidatePath)) {
          return {
            url: candidate.href,
            shortCircuit: true,
          };
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.includes('.module.css')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'const proxy = new Proxy({}, { get: (_, k) => String(k) }); export default proxy;',
    };
  }
  if (url.endsWith('.tsx') || (url.includes('.tsx?') && !url.includes('node_modules'))) {
    const filePath = fileURLToPath(url);
    const code = fs.readFileSync(filePath, 'utf-8');
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filePath,
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }
  return nextLoad(url, context);
}
