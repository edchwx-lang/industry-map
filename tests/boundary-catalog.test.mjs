import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { cacheRoots, listBoundaries, resolveBoundary } from '../scripts/lib/boundary-catalog.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('cache roots follow platform conventions and preserve the legacy read fallback', () => {
  assert.deepEqual(cacheRoots({ platform: 'darwin', homedirPath: '/Users/mei', environment: {} }), {
    primary: '/Users/mei/Library/Caches/industry-map/boundary',
    legacy: '/Users/mei/.codex/cache/industry-map/boundary',
  });
  assert.deepEqual(cacheRoots({ platform: 'linux', homedirPath: '/home/mei', environment: { XDG_CACHE_HOME: '/var/cache/mei' } }), {
    primary: '/var/cache/mei/industry-map/boundary',
    legacy: '/home/mei/.codex/cache/industry-map/boundary',
  });
  assert.deepEqual(cacheRoots({ platform: 'win32', homedirPath: 'C:\\Users\\Mei', environment: { LOCALAPPDATA: 'D:\\Local' } }), {
    primary: 'D:\\Local\\industry-map\\cache\\boundary',
    legacy: 'C:\\Users\\Mei\\.codex\\cache\\industry-map\\boundary',
  });
  assert.equal(cacheRoots({ platform: 'linux', homedirPath: '/home/mei', environment: { INDUSTRY_MAP_CACHE_DIR: '/custom/cache' } }).primary, '/custom/cache');
});

test('legacy Codex cache remains readable when the platform-native cache is empty', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-cache-roots-'));
  const primary = path.join(root, 'native');
  const legacy = path.join(root, 'legacy');
  const townRoot = path.join(legacy, 'china', 'town');
  await mkdir(townRoot, { recursive: true });
  const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}\n');
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(townRoot, '440100.geojson'), bytes);
  await writeFile(path.join(townRoot, '440100.metadata.json'), JSON.stringify({ parentAdcode: '440100', sha256 }));
  const resolved = await resolveBoundary({ skillRoot, cacheRoot: primary, legacyCacheRoot: legacy, level: 'town', parentAdcode: '440100' });
  assert.equal(resolved.path, path.join(townRoot, '440100.geojson'));
  assert.equal(resolved.provenance.kind, 'verified-cache');
});

test('catalog lists eight bundled assets and resolves Tianditu by administrative level', async () => {
  const listed = await listBoundaries({ skillRoot });
  assert.equal(listed.length, 8);
  const result = await resolveBoundary({ skillRoot, level: 'county' });
  assert.equal(result.provenance.source, '天地图');
  assert.match(result.path, /china[\\/]county[\\/]tianditu\.geojson$/);
});

test('boundary list CLI emits the local catalog', () => {
  const run = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'industry-map.mjs'), 'boundary', 'list'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const listed = JSON.parse(run.stdout);
  assert.equal(listed.length, 8);
  assert.ok(listed.some(({ id }) => id === 'town-440515'));
});

test('explicit boundary path has precedence over built-ins', async () => {
  const explicitPath = path.join(skillRoot, 'boundary', 'china', 'china.geojson');
  const result = await resolveBoundary({ skillRoot, level: 'town', parentAdcode: '441900', explicitPath });
  assert.equal(result.path, explicitPath);
  assert.equal(result.provenance.kind, 'explicit-file');
});

test('built-in township boundary has precedence over a verified cache entry', async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-cache-'));
  const cached = Buffer.from('{"type":"FeatureCollection","features":[]}\n');
  await mkdir(path.join(cacheRoot, 'china', 'town'), { recursive: true });
  await writeFile(path.join(cacheRoot, 'china', 'town', '441900.geojson'), cached);
  await writeFile(path.join(cacheRoot, 'china', 'town', '441900.metadata.json'), JSON.stringify({ parentAdcode: '441900', sha256: 'not-selected' }));
  const result = await resolveBoundary({ skillRoot, cacheRoot, level: 'town', parentAdcode: '441900' });
  assert.equal(result.provenance.kind, 'builtin');
});

test('verified township cache resolves and tampering is rejected', async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-cache-'));
  const townRoot = path.join(cacheRoot, 'china', 'town');
  await mkdir(townRoot, { recursive: true });
  const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}\n');
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(townRoot, '440100.geojson'), bytes);
  await writeFile(path.join(townRoot, '440100.metadata.json'), JSON.stringify({ parentAdcode: '440100', sha256 }));
  const resolved = await resolveBoundary({ skillRoot, cacheRoot, level: 'town', parentAdcode: '440100' });
  assert.equal(resolved.provenance.kind, 'verified-cache');
  await writeFile(path.join(townRoot, '440100.geojson'), `${bytes}tampered`);
  await assert.rejects(resolveBoundary({ skillRoot, cacheRoot, level: 'town', parentAdcode: '440100' }), /hash mismatch/i);
});

test('missing township boundary fetches only with explicit authorization', async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-cache-'));
  await assert.rejects(resolveBoundary({ skillRoot, cacheRoot, level: 'town', parentAdcode: '440200' }), /authorize an online fetch/i);
  let called = 0;
  const result = await resolveBoundary({
    skillRoot, cacheRoot, level: 'town', parentAdcode: '440200', allowFetch: true,
    parentNames: { province: '广东省', city: '测试市', county: '测试区' },
    fetchTown: async ({ parentAdcode }) => {
      called += 1;
      const townRoot = path.join(cacheRoot, 'china', 'town');
      await mkdir(townRoot, { recursive: true });
      const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}\n');
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256').update(bytes).digest('hex');
      const output = path.join(townRoot, `${parentAdcode}.geojson`);
      await writeFile(output, bytes);
      await writeFile(path.join(townRoot, `${parentAdcode}.metadata.json`), JSON.stringify({ parentAdcode, sha256: hash }));
      return { path: output };
    },
  });
  assert.equal(called, 1);
  assert.equal(result.provenance.kind, 'verified-cache');
});

test('tampered bundled asset is rejected', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-catalog-'));
  const manifest = JSON.parse(await readFile(path.join(skillRoot, 'boundary', 'manifest.json'), 'utf8'));
  await mkdir(path.join(temporaryRoot, 'boundary', 'china'), { recursive: true });
  await writeFile(path.join(temporaryRoot, 'boundary', 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(temporaryRoot, 'boundary', 'china', 'china.geojson'), '{}');
  await assert.rejects(resolveBoundary({ skillRoot: temporaryRoot, level: 'country', id: 'china' }), /hash mismatch/i);
});

test('render rejects configs that specify both geojsonPath and boundary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-config-'));
  const configPath = path.join(root, 'config.json');
  await writeFile(configPath, JSON.stringify({
    mode: 'choropleth', paletteId: 'blue-a', classes: 5,
    classification: { method: 'auto', source: 'user-confirmed' },
    geojsonPath: 'a.geojson', boundary: { level: 'county' },
    excelPath: 'a.xlsx', outputDir: 'out', sheet: 'Sheet1', headerRow: 1,
    dataRange: { startRow: 2, endRow: 2 }, geoKey: { name: 'name' }, rowKey: { name: 'name' }, metricKey: 'value',
  }));
  const run = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'industry-map.mjs'), 'render', '--config', configPath], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}${run.stdout}`, /exactly one of geojsonPath or boundary/i);
});
