import assert from 'node:assert/strict';
import test from 'node:test';

import { createMapJob } from '../scripts/lib/map-job.mjs';

const templateInput = {
  adapterType: 'template', templateVersion: '1.0.0', defaultedZeroCount: 1,
  boundary: { id: 'town-441900', level: 'town', parentAdcode: '441900', sha256: 'a'.repeat(64) },
  presentation: { title: '测试图', metricName: '企业数', unit: '' },
  rows: [{ adcode: '441900001000', name: '甲', value: 0, valueProvenance: 'defaulted_zero' }],
};

const presentation = {
  classes: 5,
  paletteId: 'blue-a',
  classification: { method: 'auto', source: 'user-confirmed' },
};

test('MapJob preserves explicit V1.2 presentation choices and template provenance', () => {
  const job = createMapJob({ input: templateInput, mode: 'choropleth', ...presentation });
  assert.equal(job.mode, 'choropleth');
  assert.equal(job.classes, 5);
  assert.equal(job.classification.method, 'auto');
  assert.equal(job.classification.source, 'user-confirmed');
  assert.equal(job.paletteId, 'blue-a');
  assert.equal(job.rows[0].valueProvenance, 'defaulted_zero');
});

test('MapJob supports freely combined bubble palettes and rejects negative values', () => {
  assert.equal(createMapJob({ input: templateInput, mode: 'bubble', ...presentation }).paletteId, 'blue-a');
  assert.throws(() => createMapJob({ input: { ...templateInput, rows: [{ ...templateInput.rows[0], value: -1 }] }, mode: 'bubble', ...presentation }), /negative/i);
});

test('MapJob requires an explicit supported map mode', () => {
  assert.throws(() => createMapJob({ input: templateInput, ...presentation }), /mode.*choropleth.*bubble/i);
});

test('MapJob rejects missing V1.2 gate answers with a migration message', () => {
  assert.throws(() => createMapJob({ input: templateInput, mode: 'choropleth' }), /V1\.2.*paletteId/i);
  assert.throws(() => createMapJob({ input: templateInput, mode: 'choropleth', paletteId: 'orange-a', classes: 5 }), /V1\.2.*classification/i);
});
