import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRuntime } from './build-runtime.mjs';

const LIMIT_BYTES = 100 * 1024 * 1024;

async function directoryBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    total += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return total;
}

export async function packageSkill({ output, skillRoot = path.resolve(import.meta.dirname, '..') }) {
  if (!output) throw new Error('--output is required');
  const destination = path.resolve(output);
  const source = path.resolve(skillRoot);
  if (destination === source || destination.startsWith(`${source}${path.sep}`) || source.startsWith(`${destination}${path.sep}`)) {
    throw new Error('package output must not contain or be contained by the source skill');
  }
  try {
    if ((await readdir(destination)).length) throw new Error('package output directory must be empty');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await buildRuntime({ skillRoot: source });
  await mkdir(destination, { recursive: true });
  for (const item of ['SKILL.md', 'agents', 'references', 'boundary', 'dist']) {
    await cp(path.join(source, item), path.join(destination, item), { recursive: true, errorOnExist: true });
  }
  const sourcePackage = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  await writeFile(path.join(destination, 'package.json'), `${JSON.stringify({ name: sourcePackage.name, version: sourcePackage.version, private: true, type: 'module' }, null, 2)}\n`);
  const bytes = await directoryBytes(destination);
  if (bytes >= LIMIT_BYTES) throw new Error(`packaged skill exceeds 100 MiB: ${bytes} bytes`);
  return { output: destination, bytes, mib: Number((bytes / 1024 / 1024).toFixed(2)) };
}

function outputArgument(argv) {
  const index = argv.indexOf('--output');
  return index >= 0 ? argv[index + 1] : undefined;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await packageSkill({ output: outputArgument(process.argv.slice(2)) }))}\n`);
}
