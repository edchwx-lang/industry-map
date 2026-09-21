import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readSkillVersion } from '../scripts/lib/version.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('source metadata exposes industry-map V1 from one package version', async () => {
  assert.deepEqual(await readSkillVersion(skillRoot), {
    name: 'industry-map',
    version: '1.4.0',
    release: 'V1',
  });
  assert.match(await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8'), /^---[\s\S]*description:\s*Use when /);
});

test('version CLI emits the source release contract', () => {
  const run = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'industry-map.mjs'), 'version'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    name: 'industry-map',
    version: '1.4.0',
    release: 'V1',
  });
});
