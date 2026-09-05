/** Explicit, user-confirmed disjoint aggregation; original rows remain in provenance. */
export function applyRegionGroups(geojson, joined, config) {
  for (const group of config.regionGroups ?? []) {
    if (group.valuesAreDisjoint !== true) throw new Error('Region grouping requires confirmed disjoint values');
    const names = group.members;
    if (!Array.isArray(names) || names.length < 2 || new Set(names).size !== names.length || !names.includes(group.target)) throw new Error('Invalid region group');
    const records = names.map(name => {
      const found = joined.matchedFeatures.filter(r => r.feature.properties[config.geoKey.name] === name);
      if (found.length !== 1) throw new Error(`Region group member must match exactly once: ${name}`);
      return found[0];
    });
    const target = records[names.indexOf(group.target)];
    const feature = { ...target.feature, geometry: { type: 'MultiPolygon', coordinates: records.flatMap(r => r.feature.geometry.type === 'Polygon' ? [r.feature.geometry.coordinates] : r.feature.geometry.coordinates) } };
    const value = records.reduce((sum, r) => sum + r.value, 0);
    const aggregate = { ...target, feature, value, row: { ...target.row, [config.metricKey]: value, valueProvenance: 'explicit-region-aggregation', sourceRows: records.map(r => r.row) } };
    const removed = new Set(records.map(r => r.feature));
    geojson.features = geojson.features.filter(f => !removed.has(f)).concat(feature);
    joined.matchedFeatures = joined.matchedFeatures.filter(r => !records.includes(r)).concat(aggregate);
  }
}
