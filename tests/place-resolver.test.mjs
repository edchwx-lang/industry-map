import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolvePlaceChildren } from '../scripts/lib/place-resolver.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('resolves the next administrative level from exact names and codes', async () => {
  const cases = [
    { place: '中国', level: 'province', count: 34 },
    { place: '广东省', level: 'city', count: 21 },
    { place: '440500', level: 'county', count: 7 },
    { place: '澄海区', level: 'town', count: 11 },
    { place: '东莞市', level: 'town', count: 34 },
  ];
  for (const item of cases) {
    const result = await resolvePlaceChildren({ skillRoot, place: item.place });
    assert.equal(result.childLevel, item.level, item.place);
    assert.equal(result.regions.length, item.count, item.place);
    assert.match(result.boundary.sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.regions.every((region) => region.name && region.adcode));
  }
});

test('ambiguous names require an exact parent code', async () => {
  await assert.rejects(resolvePlaceChildren({ skillRoot, place: '朝阳区' }), /ambiguous/i);
  await assert.rejects(resolvePlaceChildren({ skillRoot, place: '朝阳区', parentAdcode: '110100' }), /town boundary.*not local/i);
});

test('stops when a county has no local township boundary', async () => {
  await assert.rejects(resolvePlaceChildren({ skillRoot, place: '越秀区', parentAdcode: '440100' }), /town boundary.*not local/i);
});
