import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeTownCache({ cacheRoot, parentAdcode, geojsonBytes, metadata }) {
  const directory = path.join(cacheRoot, 'china', 'town');
  await mkdir(directory, { recursive: true });
  const geojsonPath = path.join(directory, `${parentAdcode}.geojson`);
  const metadataPath = path.join(directory, `${parentAdcode}.metadata.json`);
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const temporaryGeojson = `${geojsonPath}${suffix}`;
  const temporaryMetadata = `${metadataPath}${suffix}`;
  try {
    await writeFile(temporaryGeojson, geojsonBytes, { flag: 'wx' });
    await writeFile(temporaryMetadata, `${JSON.stringify(metadata)}\n`, { flag: 'wx' });
    await rename(temporaryGeojson, geojsonPath);
    await rename(temporaryMetadata, metadataPath);
    return { path: geojsonPath, metadataPath };
  } catch (error) {
    await Promise.all([rm(temporaryGeojson, { force: true }), rm(temporaryMetadata, { force: true })]);
    throw error;
  }
}

