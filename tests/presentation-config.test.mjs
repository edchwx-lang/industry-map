import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePresentationConfig } from '../scripts/lib/presentation-config.mjs';

const automatic = {
  mode: 'choropleth',
  paletteId: 'mixed-c',
  classes: 5,
  classification: { method: 'auto', source: 'user-confirmed' },
};

test('V1.2 presentation config accepts every palette with either map mode', () => {
  for (const mode of ['choropleth', 'bubble']) {
    for (const paletteId of ['blue-a', 'orange-a', 'mixed-c']) {
      assert.doesNotThrow(() => validatePresentationConfig({ ...automatic, mode, paletteId }));
    }
  }
});

test('V1.2 presentation config requires explicit gate answers', () => {
  for (const key of ['mode', 'paletteId', 'classes', 'classification']) {
    const candidate = structuredClone(automatic);
    delete candidate[key];
    assert.throws(() => validatePresentationConfig(candidate), new RegExp(`V1\\.2.*${key}`, 'i'));
  }
  assert.throws(() => validatePresentationConfig({ ...automatic, classification: { method: 'auto' } }), /V1\.2.*source/i);
});

test('V1.2 presentation config validates automatic and custom provenance', () => {
  assert.doesNotThrow(() => validatePresentationConfig(automatic));
  assert.doesNotThrow(() => validatePresentationConfig({
    ...automatic,
    classification: { method: 'custom', source: 'user-defined', thresholds: [0, 5, 15, 25, 35] },
  }));
  assert.throws(() => validatePresentationConfig({ ...automatic, classification: { method: 'custom', source: 'user-confirmed', thresholds: [0, 5, 15, 25, 35] } }), /user-defined/);
  assert.throws(() => validatePresentationConfig({ ...automatic, classification: { method: 'auto', source: 'user-defined' } }), /user-confirmed/);
});
