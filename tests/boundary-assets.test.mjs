import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { normalizeBoundary } from '../scripts/lib/boundary-normalize.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('Tianditu normalization drops linework and converts GB codes to six-digit adcodes', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: '广东省', gb: '156440000' }, geometry: { type: 'MultiPolygon', coordinates: [[[[113, 23], [114, 23], [113, 23]]]] } },
      { type: 'Feature', properties: { name: '界线', gb: '156440000' }, geometry: { type: 'MultiLineString', coordinates: [[[113, 23], [114, 23]]] } },
    ],
  };

  const normalized = normalizeBoundary({ collection, kind: 'tianditu', source: { level: 'province' } });

  assert.equal(normalized.features.length, 1);
  assert.deepEqual(normalized.features[0].properties, {
    name: '广东省', adcode: '440000', parent_adcode: '000000', level: 'province',
  });
});

test('Dongguan normalization strips WKB and rejects duplicate township codes', () => {
  const feature = {
    type: 'Feature',
    properties: { name: '莞城街道', code: '441900005000', geom: '01060000DEADBEEF' },
    geometry: { type: 'MultiPolygon', coordinates: [[[[113, 23], [114, 23], [113, 23]]]] },
  };
  const normalized = normalizeBoundary({
    collection: { type: 'FeatureCollection', features: [feature] },
    kind: 'dongguan-town', source: { parentAdcode: '441900' },
  });
  assert.deepEqual(normalized.features[0].properties, {
    name: '莞城街道', adcode: '441900005000', parent_adcode: '441900', level: 'town',
  });
  assert.throws(() => normalizeBoundary({
    collection: { type: 'FeatureCollection', features: [feature, feature] },
    kind: 'dongguan-town', source: { parentAdcode: '441900' },
  }), /duplicate adcode/i);
});

test('Chenghai normalization keeps boundary identity and removes historical metrics', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { town: '东里镇', tw_code: '440515105000', f2000: 100, Shape_Area: 12 },
      geometry: { type: 'Polygon', coordinates: [[[116, 23], [117, 23], [116, 23]]] },
    }],
  };
  const normalized = normalizeBoundary({ collection, kind: 'chenghai-town', source: { parentAdcode: '440515' } });
  assert.deepEqual(normalized.features[0].properties, {
    name: '东里镇', adcode: '440515105000', parent_adcode: '440515', level: 'town',
  });
});

test('bundled catalog contains the approved polygon-only layers with matching hashes', async () => {
  const manifest = JSON.parse(await readFile(path.join(skillRoot, 'boundary', 'manifest.json'), 'utf8'));
  const expectedCounts = {
    world: 180, china: 1, 'china-province': 34, 'china-city': 375,
    'china-county': 2891, 'county-440300': 10, 'town-441900': 34, 'town-440515': 11,
  };
  assert.equal(manifest.assets.length, 8);
  for (const asset of manifest.assets) {
    assert.equal(asset.featureCount, expectedCounts[asset.id], asset.id);
    const bytes = await readFile(path.join(skillRoot, 'boundary', asset.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.id);
    const collection = JSON.parse(bytes.toString('utf8'));
    assert.ok(collection.features.every(({ geometry }) => ['Polygon', 'MultiPolygon'].includes(geometry.type)), asset.id);
  }
});
