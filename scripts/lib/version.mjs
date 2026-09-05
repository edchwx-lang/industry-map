import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readSkillVersion(skillRoot) {
  const metadata = JSON.parse(await readFile(path.join(skillRoot, 'package.json'), 'utf8'));
  if (metadata.name !== 'industry-map' || !/^\d+\.\d+\.\d+$/.test(metadata.version ?? '')) {
    throw new Error('invalid industry-map package version');
  }
  return { name: metadata.name, version: metadata.version, release: `V${metadata.version.split('.')[0]}` };
}

