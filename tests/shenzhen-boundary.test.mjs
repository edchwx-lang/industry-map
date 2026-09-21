import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { listBoundaries, resolveBoundary } from '../scripts/lib/boundary-catalog.mjs';
import { resolvePlaceChildren } from '../scripts/lib/place-resolver.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');
test('catalog selects the explicit Shenzhen county asset without changing generic county selection', async () => {
  const listed = await listBoundaries({ skillRoot }); assert.ok(listed.some(({id}) => id === 'county-440300'));
  const shenzhen = await resolveBoundary({ skillRoot, level:'county', parentAdcode:'440300' });
  assert.equal(shenzhen.provenance.id, 'county-440300');
  const generic = await resolveBoundary({ skillRoot, level:'county' }); assert.equal(generic.provenance.id, 'china-county');
});
test('Shenzhen resolves to its ten local county children with full source codes', async () => {
  const result = await resolvePlaceChildren({ skillRoot, place:'深圳市' });
  assert.deepEqual(result.regions.map(({name,adcode}) => `${name}:${adcode}`), [
    '大鹏新区:440300440307', '罗湖区:440303000000', '福田区:440304000000',
    '南山区:440305000000', '宝安区:440306000000', '龙岗区:440307000000',
    '盐田区:440308000000', '龙华区:440309000000', '坪山区:440310000000',
    '光明区:440311000000',
  ]);
});
