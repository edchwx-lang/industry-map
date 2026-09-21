import { interiorAnchor } from './geometry.mjs';

export function buildLabelSeries({ records, unmatched, geoNameKey = 'name', showValues = false, unit = '', featureCount, canvasScale = 1, displayNameFor = feature => feature.properties?.[geoNameKey] }) {
  const count = featureCount ?? records.length + unmatched.length;
  const baselineFontSize = count <= 50 ? 28 : 24;
  const fontSize = Math.max(6, Math.round(baselineFontSize * canvasScale));
  const densityWarnings = count > 50 ? [`${count} labels are preserved; dense regions may overlap`] : [];
  const matched = records.map(record => labelDatum({
    feature: record.feature,
    name: record.displayName ?? record.feature.properties?.[geoNameKey],
    value: record.value,
    showValues,
    unit,
  }));
  const missing = unmatched.map(feature => labelDatum({ feature, name: displayNameFor(feature), showValues: false, unit }));
  return {
    series: {
      type: 'scatter', name: '__administrative_labels__', coordinateSystem: 'geo', silent: true,
      symbolSize: 1, itemStyle: { color: 'transparent', opacity: 1 },
      label: {
        show: true, position: 'inside', formatter: params => params.data.displayText,
        fontSize, fontFamily: 'Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif', fontWeight: 700,
        color: '#161B22', opacity: 1, textBorderWidth: 0, textShadowBlur: 0,
        backgroundColor: 'transparent', padding: [2 * canvasScale, 4 * canvasScale],
        lineHeight: Math.round(fontSize * 1.25),
      },
      labelLayout: { hideOverlap: false },
      data: [...matched, ...missing],
    },
    metadata: { mode: showValues ? 'name-value' : 'name', emittedLabelCount: matched.length + missing.length, densityWarnings },
  };
}

function labelDatum({ feature, name, value, showValues, unit }) {
  const valueText = showValues && typeof value === 'number' && Number.isFinite(value) ? `\n${value}${unit ? ` ${unit}` : ''}` : '';
  return { name, displayText: `${name}${valueText}`, value: interiorAnchor(feature.geometry) };
}
