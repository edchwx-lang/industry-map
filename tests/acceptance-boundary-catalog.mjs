import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { listBoundaries, resolveBoundary } from '../scripts/lib/boundary-catalog.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('approved boundary catalog resolves every bundled layer with manifest counts and hashes', async () => {
  const expected = new Map([
    ['world', 180], ['china', 1], ['china-province', 34], ['china-city', 375],
    ['china-county', 2891], ['town-441900', 34], ['town-440515', 11],
  ]);
  const listed = await listBoundaries({ skillRoot });
  assert.deepEqual(new Map(listed.map(({ id, featureCount }) => [id, featureCount])), expected);
  for (const asset of listed) {
    const resolved = await resolveBoundary({ skillRoot, id: asset.id, level: asset.level, parentAdcode: asset.parentAdcode });
    const actualHash = createHash('sha256').update(await readFile(resolved.path)).digest('hex');
    assert.equal(actualHash, asset.sha256, asset.id);
  }
});

