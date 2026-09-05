const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

function text(value, field) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`missing ${field}`);
  return result;
}

function parentFor(adcode, level, explicit) {
  if (explicit) return String(explicit);
  if (level === 'country') return '000000';
  if (level === 'province') return '000000';
  if (level === 'city') return `${adcode.slice(0, 2)}0000`;
  if (level === 'county') return `${adcode.slice(0, 4)}00`;
  return '';
}

function identity(feature, kind, source) {
  const props = feature.properties ?? {};
  if (kind === 'tianditu') {
    const gb = text(props.gb, 'gb');
    const adcode = gb.startsWith('156') && gb.length === 9 ? gb.slice(3) : gb;
    return { name: text(props.name, 'name'), adcode, level: source.level };
  }
  if (kind === 'dongguan-town') {
    return { name: text(props.name, 'name'), adcode: text(props.code, 'code'), level: 'town' };
  }
  if (kind === 'chenghai-town') {
    return { name: text(props.town, 'town'), adcode: text(props.tw_code, 'tw_code'), level: 'town' };
  }
  if (kind === 'china') {
    return { name: text(props.name, 'name'), adcode: String(props.adcode ?? '100000'), level: 'country' };
  }
  if (kind === 'world') {
    return { name: text(props.name, 'name'), adcode: String(props.adcode ?? props.id ?? feature.id ?? props.name), level: 'country' };
  }
  throw new Error(`unsupported boundary kind: ${kind}`);
}

export function normalizeBoundary({ collection, kind, source = {} }) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('boundary must be a GeoJSON FeatureCollection');
  }
  const seen = new Set();
  const features = [];
  for (const feature of collection.features) {
    if (!POLYGON_TYPES.has(feature?.geometry?.type)) continue;
    const item = identity(feature, kind, source);
    if (seen.has(item.adcode)) throw new Error(`duplicate adcode: ${item.adcode}`);
    seen.add(item.adcode);
    features.push({
      type: 'Feature',
      properties: {
        name: item.name,
        adcode: item.adcode,
        parent_adcode: parentFor(item.adcode, item.level, source.parentAdcode),
        level: item.level,
      },
      geometry: feature.geometry,
    });
  }
  features.sort((a, b) => a.properties.adcode.localeCompare(b.properties.adcode) || a.properties.name.localeCompare(b.properties.name, 'zh-CN'));
  return { type: 'FeatureCollection', features };
}

