import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

import { packageSkill } from './package-skill.mjs';

function zipDirectory(source, output) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(output, { flags: 'wx' });
    const archive = archiver('zip', { zlib: { level: 9 } });
    stream.on('close', resolve);
    stream.on('error', reject);
    archive.on('error', reject);
    archive.pipe(stream);
    archive.directory(source, 'industry-map');
    archive.finalize();
  });
}

export async function packageAgents({ output, skillRoot = path.resolve(import.meta.dirname, '..') }) {
  if (!output) throw new Error('--output is required');
  const root = path.resolve(output);
  await mkdir(root, { recursive: true });
  const packages = {};
  for (const agent of ['codex', 'claude', 'workbuddy']) {
    const destination = path.join(root, agent, 'industry-map');
    packages[agent] = await packageSkill({ output: destination, skillRoot });
  }
  const { version } = JSON.parse(await readFile(path.join(skillRoot, 'package.json'), 'utf8'));
  const zip = path.join(root, `industry-map-workbuddy-v${version}.zip`);
  await zipDirectory(packages.workbuddy.output, zip);
  return { output: root, packages, zip };
}

function outputArgument(argv) {
  const index = argv.indexOf('--output');
  return index >= 0 ? argv[index + 1] : undefined;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await packageAgents({ output: outputArgument(process.argv.slice(2)) }))}\n`);
}
