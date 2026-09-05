import { createHash } from 'node:crypto';
import { homedir, platform as hostPlatform } from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchTownBoundary } from './town-provider.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function cacheRoots({
  platform = hostPlatform(), homedirPath = homedir(), environment = process.env,
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const legacy = pathApi.join(homedirPath, '.codex', 'cache', 'industry-map', 'boundary');
  if (environment.INDUSTRY_MAP_CACHE_DIR) return { primary: environment.INDUSTRY_MAP_CACHE_DIR, legacy };
  if (platform === 'win32') {
    const local = environment.LOCALAPPDATA || pathApi.join(homedirPath, 'AppData', 'Local');
    return { primary: pathApi.join(local, 'industry-map', 'cache', 'boundary'), legacy };
  }
  if (platform === 'darwin') {
    return { primary: pathApi.join(homedirPath, 'Library', 'Caches', 'industry-map', 'boundary'), legacy };
  }
  const xdg = environment.XDG_CACHE_HOME || pathApi.join(homedirPath, '.cache');
  return { primary: pathApi.join(xdg, 'industry-map', 'boundary'), legacy };
}

export async function loadBoundaryManifest(skillRoot) {
  const manifestPath = path.join(skillRoot, 'boundary', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) throw new Error('unsupported boundary manifest');
  return manifest;
}

export async function listBoundaries({ skillRoot }) {
  const manifest = await loadBoundaryManifest(skillRoot);
  return manifest.assets.map(({ id, level, parentAdcode, source, featureCount, sha256: hash }) => ({
    id, level, ...(parentAdcode ? { parentAdcode } : {}), source, featureCount, sha256: hash,
  }));
}

async function checkedFile(filePath, expectedHash, label) {
  const bytes = await readFile(filePath);
  const actual = sha256(bytes);
  if (actual !== expectedHash) throw new Error(`${label} hash mismatch: expected ${expectedHash}, got ${actual}`);
  return actual;
}

function safeAssetPath(skillRoot, relativePath) {
  const boundaryRoot = path.resolve(skillRoot, 'boundary');
  const resolved = path.resolve(boundaryRoot, ...relativePath.split('/'));
  if (resolved !== boundaryRoot && !resolved.startsWith(`${boundaryRoot}${path.sep}`)) throw new Error('boundary manifest path escapes asset root');
  return resolved;
}

export async function resolveBoundary({
  skillRoot, level, parentAdcode, id, explicitPath,
  allowFetch = false, parentNames, fetchTown = fetchTownBoundary, baseUrl,
  cacheRoot, legacyCacheRoot,
}) {
  const defaults = cacheRoots();
  const primaryCacheRoot = cacheRoot ?? defaults.primary;
  const fallbackCacheRoot = legacyCacheRoot ?? (cacheRoot ? undefined : defaults.legacy);
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    const hash = sha256(await readFile(resolved));
    return { path: resolved, provenance: { kind: 'explicit-file', source: 'explicit-file', level, parentAdcode, sha256: hash } };
  }
  const manifest = await loadBoundaryManifest(skillRoot);
  const candidates = manifest.assets.filter((asset) =>
    (!id || asset.id === id) && asset.level === level && (!parentAdcode || asset.parentAdcode === String(parentAdcode))
  );
  if (candidates.length > 1) throw new Error(`boundary selection is ambiguous; specify id (${candidates.map(({ id: value }) => value).join(', ')})`);
  if (candidates.length === 1) {
    const asset = candidates[0];
    const filePath = safeAssetPath(skillRoot, asset.path);
    await checkedFile(filePath, asset.sha256, `bundled asset ${asset.id}`);
    return { path: filePath, provenance: { kind: asset.level === 'town' ? 'builtin' : 'bundled', source: asset.source, level: asset.level, parentAdcode: asset.parentAdcode, id: asset.id, sha256: asset.sha256 } };
  }
  if (level === 'town' && parentAdcode) {
    for (const root of [...new Set([primaryCacheRoot, fallbackCacheRoot].filter(Boolean))]) {
      const townRoot = path.join(root, 'china', 'town');
      const filePath = path.join(townRoot, `${parentAdcode}.geojson`);
      const metadataPath = path.join(townRoot, `${parentAdcode}.metadata.json`);
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (String(metadata.parentAdcode) !== String(parentAdcode)) throw new Error('cache metadata parent adcode mismatch');
        const hash = await checkedFile(filePath, metadata.sha256, `cached boundary ${parentAdcode}`);
        return { path: filePath, provenance: { kind: 'verified-cache', source: metadata.source ?? 'ruiduobao/china-divisions-map', level, parentAdcode: String(parentAdcode), sha256: hash } };
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    if (!allowFetch) throw new Error(`town boundary ${parentAdcode} is not local; authorize an online fetch first`);
    await fetchTown({ parentAdcode: String(parentAdcode), parentNames, baseUrl, cacheRoot: primaryCacheRoot });
    return resolveBoundary({ skillRoot, level, parentAdcode, id, cacheRoot: primaryCacheRoot, legacyCacheRoot: fallbackCacheRoot, allowFetch: false });
  }
  throw new Error(`no bundled boundary matches level=${level}${id ? ` id=${id}` : ''}`);
}
