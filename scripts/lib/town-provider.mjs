import { createHash } from 'node:crypto';

import { writeTownCache } from './boundary-cache.mjs';

const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

async function fetchBytes(url, { fetchImpl, timeoutMs, maxBytes }) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(`request timed out: ${url}`);
    throw error;
  }
  if (!response.ok) throw new Error(`provider request failed (${response.status}): ${url}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`maximum response size exceeded: ${declared} > ${maxBytes}`);
  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(`request timed out: ${url}`);
    throw error;
  }
  if (bytes.length > maxBytes) throw new Error(`maximum response size exceeded: ${bytes.length} > ${maxBytes}`);
  return bytes;
}

async function fetchJson(url, options) {
  const bytes = await fetchBytes(url, options);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`provider returned invalid JSON: ${url}`); }
}

async function workerMap(items, concurrency, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function fetchTownBoundary({
  parentAdcode, parentNames, baseUrl = 'https://map.ruiduobao.com', cacheRoot,
  fetchImpl = fetch, timeoutMs = 20_000, maxBytes = 20 * 1024 * 1024, concurrency = 4,
}) {
  if (!/^\d{6}$/.test(String(parentAdcode))) throw new Error('parentAdcode must contain six digits');
  if (!cacheRoot) throw new Error('cacheRoot is required');
  if (!parentNames?.province || !parentNames?.city || !parentNames?.county) throw new Error('parentNames requires province, city, and county');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('concurrency must be an integer from 1 to 8');
  const origin = new URL(baseUrl);
  const listUrl = new URL('/api/tree/towns', origin);
  listUrl.search = new URLSearchParams({ year: '2023', province: parentNames.province, city: parentNames.city, county: parentNames.county });
  const options = { fetchImpl, timeoutMs, maxBytes };
  const listing = await fetchJson(listUrl, options);
  if (listing?.status !== 'success' || !Array.isArray(listing.data) || !listing.data.length) throw new Error('provider returned no township list');
  const codes = new Set();
  for (const town of listing.data) {
    if (!/^\d{12}$/.test(String(town.code)) || !String(town.code).startsWith(String(parentAdcode))) throw new Error(`invalid township code: ${town.code}`);
    if (!String(town.name ?? '').trim()) throw new Error(`missing township name: ${town.code}`);
    if (codes.has(String(town.code))) throw new Error(`duplicate township code: ${town.code}`);
    codes.add(String(town.code));
  }
  const features = (await workerMap(listing.data, concurrency, async (town) => {
    const requestUrl = new URL('/getGsonDB', origin);
    requestUrl.search = new URLSearchParams({ code: town.code });
    const prepared = await fetchJson(requestUrl, options);
    if (prepared?.status !== 'success' || !prepared.filepath) throw new Error(`provider failed to prepare township ${town.code}`);
    const vectorUrl = new URL(prepared.filepath, origin);
    if (vectorUrl.origin !== origin.origin) throw new Error(`provider vector path must use the same origin: ${prepared.filepath}`);
    const collection = await fetchJson(vectorUrl, options);
    if (collection?.type !== 'FeatureCollection' || collection.features?.length !== 1) throw new Error(`township ${town.code} must contain exactly one feature`);
    const feature = collection.features[0];
    if (!POLYGON_TYPES.has(feature?.geometry?.type)) throw new Error(`township ${town.code} has unsupported geometry`);
    if (String(feature.properties?.code) !== String(town.code)) throw new Error(`township code mismatch: ${town.code}`);
    if (String(feature.properties?.name).trim() !== String(town.name).trim()) throw new Error(`township name mismatch: ${town.code}`);
    return { type: 'Feature', properties: { name: String(town.name).trim(), adcode: String(town.code), parent_adcode: String(parentAdcode), level: 'town' }, geometry: feature.geometry };
  })).sort((a, b) => a.properties.adcode.localeCompare(b.properties.adcode));
  const collection = { type: 'FeatureCollection', features };
  const geojsonBytes = Buffer.from(`${JSON.stringify(collection)}\n`);
  const sha256 = createHash('sha256').update(geojsonBytes).digest('hex');
  const metadata = {
    schemaVersion: 1, parentAdcode: String(parentAdcode), parentNames,
    source: 'ruiduobao/china-divisions-map', sourceUrl: origin.href,
    featureCount: features.length, sha256,
  };
  const written = await writeTownCache({ cacheRoot, parentAdcode: String(parentAdcode), geojsonBytes, metadata });
  return { ...written, metadata };
}

