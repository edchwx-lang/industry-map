import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function buildRuntime({ skillRoot = path.resolve(import.meta.dirname, '..') } = {}) {
  const outfile = path.join(skillRoot, 'dist', 'industry-map.mjs');
  await mkdir(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [path.join(skillRoot, 'scripts', 'industry-map.mjs')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: true,
    charset: 'ascii',
    supported: { 'template-literal': false },
    sourcemap: false,
    legalComments: 'none',
    banner: { js: 'import { createRequire as __industryMapCreateRequire } from "node:module"; const require = __industryMapCreateRequire(import.meta.url);' },
  });
  return outfile;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${await buildRuntime()}\n`);
}
