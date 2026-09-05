/** Join tabular records to GeoJSON features with exact matching only. */
export function joinRecords({ features, rows, geoKey, rowKey, metricKey, aliases = [] }) {
  const normalizedAliases = new Map(aliases.map(alias => [normalize(alias.excel), alias]));
  const geoCode = indexFeatures(features, feature => feature.properties?.[geoKey.code]);
  const geoName = indexFeatures(features, feature => feature.properties?.[geoKey.name]);
  const rowDuplicates = duplicateRows(rows, row => row[rowKey.code] || row[rowKey.name]);
  const featureDuplicates = duplicateRows(features, feature => feature.properties?.[geoKey.code] || feature.properties?.[geoKey.name]);
  const used = new Set();
  const unmatchedRows = [];
  const matchedFeatures = [];
  const aliasApplications = [];
  const seenRowKeys = new Set();
  for (const row of rows) {
    const code = normalize(row[rowKey.code]);
    const originalName = normalize(row[rowKey.name]);
    const rowIdentity = code || originalName;
    if (rowIdentity && seenRowKeys.has(rowIdentity)) continue;
    if (rowIdentity) seenRowKeys.add(rowIdentity);
    const alias = normalizedAliases.get(originalName);
    const name = alias ? normalize(alias.geo) : originalName;
    let feature = code ? geoCode.get(code) : undefined;
    if (!feature && name) feature = geoName.get(name);
    if (!feature || used.has(feature)) {
      unmatchedRows.push(row);
      continue;
    }
    used.add(feature);
    if (alias) aliasApplications.push(alias);
    matchedFeatures.push({
      feature,
      value: row[metricKey],
      displayName: alias?.display ?? feature.properties?.[geoKey.name],
      row,
    });
  }
  const unmatchedFeatures = features.filter(feature => !used.has(feature));
  return {
    matchedFeatures,
    unmatchedRows,
    unmatchedFeatures,
    duplicates: { rows: rowDuplicates, features: featureDuplicates },
    aliasApplications,
    blocking: Boolean(unmatchedRows.length || unmatchedFeatures.length || rowDuplicates.length || featureDuplicates.length),
  };
}

function indexFeatures(features, getValue) {
  const result = new Map();
  for (const feature of features) {
    const key = normalize(getValue(feature));
    if (key && !result.has(key)) result.set(key, feature);
  }
  return result;
}

function duplicateRows(items, getKey) {
  const grouped = new Map();
  for (const item of items) {
    const key = normalize(getKey(item));
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return [...grouped].filter(([, group]) => group.length > 1).map(([key, items]) => ({ key, items }));
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim();
}
