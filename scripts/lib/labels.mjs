import { interiorAnchor } from './geometry.mjs';

export function buildLabelSeries({ records, unmatched, geoNameKey = 'name', showValues = false, unit = '', featureCount, canvasScale = 1 }) {
  const count = featureCount ?? records.length + unmatched.length;
  const baselineFontSize = count <= 50 ? 28 : count <= 100 ? 24 : 18;
  const fontSize = Math.max(6, Math.round(baselineFontSize * canvasScale));
  const textBorderWidth = Math.max(1, Math.round(3 * canvasScale));
  const densityWarnings = count > 50 ? [`${count} labels are preserved; dense regions may overlap`] : [];
  const matched = records.map(record => labelDatum({
    feature: record.feature,
    name: record.displayName ?? record.feature.properties?.[geoNameKey],
    value: record.value,
    showValues,
    unit,
  }));
  const missing = unmatched.map(feature => labelDatum({ feature, name: feature.properties?.[geoNameKey], showValues: false, unit }));
  return {
    series: {
      type: 'scatter', name: '__administrative_labels__', coordinateSystem: 'geo', silent: true,
      symbolSize: 1, itemStyle: { color: 'transparent' },
      label: {
        show: true, position: 'inside', formatter: params => params.data.displayText,
        fontSize, fontWeight: 500, color: '#283746', textBorderColor: '#FFFFFF', textBorderWidth,
        lineHeight: Math.round(fontSize * 1.25),
      },
      labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
      data: [...matched, ...missing],
    },
    metadata: { mode: showValues ? 'name-value' : 'name', emittedLabelCount: matched.length + missing.length, densityWarnings },
  };
}

function labelDatum({ feature, name, value, showValues, unit }) {
  const valueText = showValues && typeof value === 'number' && Number.isFinite(value) ? `\n${value}${unit ? ` ${unit}` : ''}` : '';
  return { name, displayText: `${name}${valueText}`, value: interiorAnchor(feature.geometry) };
}
