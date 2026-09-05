import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fetchTownBoundary } from '../scripts/lib/town-provider.mjs';

const polygon = { type: 'MultiPolygon', coordinates: [[[[116, 23], [117, 23], [116, 23]]]] };
const names = { province: '广东省', city: '测试市', county: '测试区' };

async function fakeProvider(t, { towns, vectorFor, pathFor } = {}) {
  let active = 0;
  let peak = 0;
  const list = towns ?? [
    { name: '甲镇', code: '440100100000', ...names },
    { name: '乙镇', code: '440100101000', ...names },
  ];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (url.pathname === '/api/tree/towns') return response.end(JSON.stringify({ status: 'success', code: 200, data: list }));
    if (url.pathname === '/getGsonDB') return response.end(JSON.stringify({ status: 'success', filepath: pathFor?.(url.searchParams.get('code')) ?? `/vectordata/${url.searchParams.get('code')}.gson` }));
    if (url.pathname.startsWith('/vectordata/')) {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const code = path.basename(url.pathname, '.gson');
      const item = list.find((town) => town.code === code);
      const payload = vectorFor?.(item) ?? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: item.name, code: item.code, geom: 'WKB' }, geometry: polygon }] };
      active -= 1;
      return response.end(JSON.stringify(payload));
    }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, peak: () => peak };
}

test('fetches all listed towns, strips provider WKB, and commits a verified cache atomically', async (t) => {
  const provider = await fakeProvider(t);
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-town-'));
  const result = await fetchTownBoundary({ parentAdcode: '440100', parentNames: names, baseUrl: provider.baseUrl, cacheRoot, concurrency: 2 });
  const collection = JSON.parse(await readFile(result.path, 'utf8'));
  assert.equal(collection.features.length, 2);
  assert.deepEqual(collection.features.map(({ properties }) => properties), [
    { name: '甲镇', adcode: '440100100000', parent_adcode: '440100', level: 'town' },
    { name: '乙镇', adcode: '440100101000', parent_adcode: '440100', level: 'town' },
  ]);
  assert.equal(provider.peak(), 2);
  assert.equal(result.metadata.featureCount, 2);
  assert.ok(!((await readdir(path.dirname(result.path))).some((name) => name.includes('.tmp-'))));
});

test('rejects vector code or name mismatch and leaves no partial cache', async (t) => {
  const provider = await fakeProvider(t, { vectorFor: (item) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: `${item.name}错`, code: item.code }, geometry: polygon }] }) });
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-town-'));
  await assert.rejects(fetchTownBoundary({ parentAdcode: '440100', parentNames: names, baseUrl: provider.baseUrl, cacheRoot }), /name mismatch/i);
  const files = await readdir(path.join(cacheRoot, 'china', 'town')).catch(() => []);
  assert.deepEqual(files, []);
});

test('rejects provider vector paths on another origin', async (t) => {
  const provider = await fakeProvider(t, { pathFor: () => 'https://example.com/stolen.gson' });
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'industry-map-town-'));
  await assert.rejects(fetchTownBoundary({ parentAdcode: '440100', parentNames: names, baseUrl: provider.baseUrl, cacheRoot }), /same origin/i);
});

test('enforces response-size and timeout limits', async (t) => {
  const provider = await fakeProvider(t);
  const root1 = await mkdtemp(path.join(os.tmpdir(), 'industry-map-town-'));
  await assert.rejects(fetchTownBoundary({ parentAdcode: '440100', parentNames: names, baseUrl: provider.baseUrl, cacheRoot: root1, maxBytes: 20 }), /maximum response size/i);
  const root2 = await mkdtemp(path.join(os.tmpdir(), 'industry-map-town-'));
  await assert.rejects(fetchTownBoundary({ parentAdcode: '440100', parentNames: names, baseUrl: provider.baseUrl, cacheRoot: root2, timeoutMs: 1 }), /timed out/i);
});
