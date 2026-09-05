import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveBoundary } from './boundary-catalog.mjs';

const SEARCH_LEVELS = [
  { level: 'country', id: 'china' },
  { level: 'province' },
  { level: 'city' },
  { level: 'county' },
];

async function collectionFor(skillRoot, selector) {
  const resolved = await resolveBoundary({ skillRoot, ...selector });
  return { resolved, collection: JSON.parse(await readFile(resolved.path, 'utf8')) };
}

function regionIdentity(feature) {
  return {
    name: String(feature.properties.name),
    adcode: String(feature.properties.adcode),
    parentAdcode: String(feature.properties.parent_adcode),
    level: String(feature.properties.level),
  };
}

export async function resolvePlaceChildren({ skillRoot, place, parentAdcode }) {
  const input = String(place ?? '').trim();
  if (!input) throw new Error('place is required');
  const query = ['中国', '全国'].includes(input) ? '中华人民共和国' : input;
  const matches = [];
  for (const selector of SEARCH_LEVELS) {
    const { collection } = await collectionFor(skillRoot, selector);
    for (const feature of collection.features) {
      const identity = regionIdentity(feature);
      if (identity.name !== query && identity.adcode !== query) continue;
      if (parentAdcode && identity.parentAdcode !== String(parentAdcode)) continue;
      matches.push(identity);
    }
  }
  const unique = [...new Map(matches.map((item) => [item.adcode, item])).values()];
  if (!unique.length) throw new Error(`place not found: ${query}`);
  if (unique.length > 1) throw new Error(`place is ambiguous: ${query}; specify parentAdcode`);
  const matched = unique[0];
  let child;
  if (matched.level === 'country') child = { level: 'province' };
  else if (matched.level === 'province') child = { level: 'city', parentAdcode: matched.adcode };
  else if (matched.level === 'city' && matched.adcode === '441900') child = { level: 'town', parentAdcode: matched.adcode };
  else if (matched.level === 'city') child = { level: 'county', parentAdcode: matched.adcode };
  else child = { level: 'town', parentAdcode: matched.adcode };

  const selector = child.level === 'town' ? child : { level: child.level };
  const { resolved, collection } = await collectionFor(skillRoot, selector);
  const features = child.level === 'town'
    ? collection.features
    : collection.features.filter((feature) => !child.parentAdcode || String(feature.properties.parent_adcode) === child.parentAdcode);
  if (!features.length) throw new Error(`no ${child.level} regions found for ${matched.name}`);
  return {
    place: matched,
    childLevel: child.level,
    boundary: { ...resolved.provenance, path: path.resolve(resolved.path), parentAdcode: child.parentAdcode },
    regions: features.map(regionIdentity).sort((a, b) => a.adcode.localeCompare(b.adcode)),
  };
}
