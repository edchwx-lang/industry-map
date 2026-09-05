import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeBoundary } from './lib/boundary-normalize.mjs';

const DEFINITIONS = [
  { key: 'world', id: 'world', path: 'world/world.geojson', kind: 'world', level: 'country', source: 'Natural Earth derivative supplied by user', priority: 20 },
  { key: 'china', id: 'china', path: 'china/china.geojson', kind: 'china', level: 'country', source: 'User-supplied China outline', priority: 30 },
  { key: 'province', id: 'china-province', path: 'china/province/tianditu.geojson', kind: 'tianditu', level: 'province', source: '天地图', priority: 100 },
  { key: 'city', id: 'china-city', path: 'china/city/tianditu.geojson', kind: 'tianditu', level: 'city', source: '天地图', priority: 100 },
  { key: 'county', id: 'china-county', path: 'china/county/tianditu.geojson', kind: 'tianditu', level: 'county', source: '天地图', priority: 100 },
  { key: 'town441900', id: 'town-441900', path: 'china/town/builtin/441900.geojson', kind: 'dongguan-town', level: 'town', parentAdcode: '441900', source: 'User-supplied Dongguan township boundary', priority: 120 },
  { key: 'town440515', id: 'town-440515', path: 'china/town/builtin/440515.geojson', kind: 'chenghai-town', level: 'town', parentAdcode: '440515', source: 'User-supplied Chenghai township boundary', priority: 120 },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableJson = (value) => `${JSON.stringify(value)}\n`;

function crsName(collection) {
  return collection?.crs?.properties?.name ?? collection?.crs?.name ?? 'unspecified (coordinates retained)';
}

export async function buildBoundaryAssets({ sources, outputRoot }) {
  const assets = [];
  for (const definition of DEFINITIONS) {
    const sourcePath = sources[definition.key];
    if (!sourcePath) throw new Error(`missing source: ${definition.key}`);
    const sourceBytes = await readFile(sourcePath);
    const sourceCollection = JSON.parse(sourceBytes.toString('utf8'));
    const collection = normalizeBoundary({
      collection: sourceCollection,
      kind: definition.kind,
      source: { level: definition.level, parentAdcode: definition.parentAdcode },
    });
    const outputBytes = Buffer.from(stableJson(collection));
    const target = path.join(outputRoot, ...definition.path.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, outputBytes);
    assets.push({
      id: definition.id,
      path: definition.path,
      level: definition.level,
      ...(definition.parentAdcode ? { parentAdcode: definition.parentAdcode } : {}),
      source: definition.source,
      sourceFile: path.basename(sourcePath),
      sourceCrs: crsName(sourceCollection),
      sourceSha256: sha256(sourceBytes),
      sha256: sha256(outputBytes),
      featureCount: collection.features.length,
      geometryTypes: [...new Set(collection.features.map((feature) => feature.geometry.type))].sort(),
      bytes: outputBytes.length,
      priority: definition.priority,
      transformations: ['retain polygon geometry only', 'canonical identity properties', 'deterministic feature ordering'],
    });
  }
  const manifest = {
    schemaVersion: 1,
    use: 'Non-commercial only; verify upstream terms before redistribution.',
    precedence: ['explicit-file', 'builtin-town', 'tianditu', 'verified-cache', 'authorized-online-fetch'],
    assets,
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'manifest.json'), stableJson(manifest));
  await mkdir(path.join(outputRoot, 'china', 'town'), { recursive: true });
  await writeFile(path.join(outputRoot, 'china', 'town', 'sources.json'), stableJson({
    schemaVersion: 1,
    provider: 'ruiduobao/china-divisions-map',
    repository: 'https://github.com/ruiduobao/china-divisions-map',
    serviceBaseUrl: 'https://map.ruiduobao.com',
    use: 'Non-commercial only',
  }));
  return manifest;
}

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`invalid argument: ${argv[i]}`);
    map.set(argv[i].slice(2), argv[i + 1]);
  }
  return map;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = args.get('output') ?? path.resolve(import.meta.dirname, '..', 'boundary');
  const manifest = await buildBoundaryAssets({
    outputRoot,
    sources: {
      world: args.get('world'), china: args.get('china'), province: args.get('province'),
      city: args.get('city'), county: args.get('county'),
      town441900: args.get('town-441900'), town440515: args.get('town-440515'),
    },
  });
  process.stdout.write(`${JSON.stringify({ outputRoot, assets: manifest.assets.length })}\n`);
}

