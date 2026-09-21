import { classifyValues } from './classify.mjs';
import { resolvePalette } from './palettes.mjs';
import { buildPublicationLayout, bubbleDiameters } from './layout.mjs';
import { interiorAnchor } from './geometry.mjs';
import { buildLabelSeries } from './labels.mjs';
import { buildLegendGraphics } from './legend.mjs';
import { geographicPresentation, isTaiwan } from './projection.mjs';

const DIVERGING = ['#b2182b', '#ef8a62', '#f7f7f7', '#67a9cf', '#2166ac'];
const NULL_GRAY = '#d9d9d9';

/** Build a deterministic ECharts map option from a resolved join result. */
export function buildChartOption(resolvedConfig, joined) {
  const mode = resolvedConfig?.mode;
  if (!['choropleth', 'bubble'].includes(mode)) throw new Error('mode must be either choropleth or bubble');
  const geography = geographicPresentation(resolvedConfig, joined);
  const records = (joined?.matchedFeatures ?? []).map(record => geography.scope === 'china-province' && isTaiwan(record.feature,resolvedConfig.geoKey) ? {...record,displayName:'台湾省'} : record);
  const unmatched = joined?.unmatchedFeatures ?? [];
  const values = records.map(record => record.value).filter(isFiniteNumber);
  if (mode === 'bubble' && values.some(value => value < 0)) throw new Error('negative bubble values are not supported');
  const classification = resolveClassification(resolvedConfig, values);
  const labelRecords = geography.scope === 'world' ? records.filter(record => isFiniteNumber(record.value) && classIndex(record.value, classification) > 0) : records;
  const labelUnmatched = geography.scope === 'world' ? [] : unmatched;
  const labels = new Map(records.map(record => [record.feature, record.displayName]));
  const common = layout(resolvedConfig);
  common.geo.projection = geography.projection;
  common.geo.preserveAspect = 'contain';
  common.geo.aspectScale = 1;
  common.geographicMetadata = geography.metadata;
  const canvasScale = Math.min((resolvedConfig.width ?? 3840) / 3840, (resolvedConfig.height ?? 2160) / 2160);
  const labelLayer = buildLabelSeries({
    records: labelRecords,
    unmatched: labelUnmatched,
    geoNameKey: resolvedConfig.geoKey?.name ?? 'name',
    showValues: resolvedConfig.labels?.showValues === true,
    unit: resolvedConfig.unit ?? '',
    featureCount: labelRecords.length + labelUnmatched.length,
    canvasScale,
    displayNameFor: feature => geography.scope === 'china-province' && isTaiwan(feature,resolvedConfig.geoKey) ? '台湾省' : feature.properties?.[resolvedConfig.geoKey?.name ?? 'name'],
  });
  if (geography.scope === 'world') Object.assign(labelLayer.metadata, {visibility:'above-lowest-class',hiddenLowestClassCount:records.length-labelRecords.length,hiddenUnmatchedCount:unmatched.length});
  if (mode === 'bubble') return bubbleOption(common, records, unmatched, labels, resolvedConfig, labelLayer, classification);
  return choroplethOption(common, records, unmatched, labels, resolvedConfig, values, labelLayer, classification);
}

function choroplethOption(common, records, unmatched, labels, config, values, labelLayer, classification) {
  const palette = values.some(value => value < 0) && values.some(value => value > 0) && classification.classes === 5
    ? DIVERGING : resolvePalette({ paletteId: config.paletteId ?? 'blue-a', classes: classification.classes });
  classification.colors = palette;
  const legend = buildLegendGraphics({
    mode: 'choropleth', classification, colors: palette,
    metricName: config.metricName ?? config.metricKey ?? '指标', metricNameEnglish: config.metricNameEnglish, unit: config.unit,
    frame: common.publication.legendFrame, values,
  });
  const featureData = [
    ...records.map(record => mapData(record, labels.get(record.feature), config, classification, palette)),
    ...unmatched.map(feature => ({ name: feature.properties?.[config.geoKey?.name ?? 'name'], value: null, itemStyle: { areaColor: NULL_GRAY } })),
  ];
  common.geo.itemStyle = { borderColor: '#ffffff', borderWidth: 1.5, areaColor: NULL_GRAY };
  common.geo.regions = featureData.map(({ name, itemStyle }) => ({ name, itemStyle }));
  return {
    option: {
      ...common,
      graphic: [...common.graphic, legend.graphics],
      series: [{
        type: 'map',
        map: 'industry-map',
        geoIndex: 0,
        roam: false,
        selectedMode: false,
        label: { show: false },
        itemStyle: { borderColor: '#ffffff', borderWidth: 1.5, areaColor: NULL_GRAY },
        emphasis: { disabled: true },
        data: featureData,
      }, labelLayer.series],
    },
    layout: { mode: 'choropleth', nullColor: NULL_GRAY, palette },
    classification,
    presentation: { labels: labelLayer.metadata, legend: legend.metadata, geography: common.geographicMetadata },
  };
}

function bubbleOption(common, records, unmatched, labels, config, labelLayer, classification) {
  if (records.some(record => isFiniteNumber(record.value) && record.value < 0)) throw new Error('negative bubble values are not supported');
  const values = records.map(record => record.value).filter(isFiniteNumber);
  if (!values.length) throw new Error('bubble requires at least one finite numeric value');
  const colors = resolvePalette({ paletteId: config.paletteId ?? 'orange-a', classes: classification.classes });
  const canvasScale = Math.min((config.width ?? 3840) / 3840, (config.height ?? 2160) / 2160);
  const diameters = bubbleDiameters(classification.classes).map(value => value * canvasScale);
  classification.colors = colors;
  const legend = buildLegendGraphics({
    mode: 'bubble', classification, colors, diameters, hideLowestClass: true,
    metricName: config.metricName ?? config.metricKey ?? '指标', metricNameEnglish: config.metricNameEnglish, unit: config.unit,
    frame: common.publication.legendFrame, values,
  });
  const mapData = [
    ...records.map(record => ({ name: record.feature.properties?.[config.geoKey?.name ?? 'name'], value: record.value })),
    ...unmatched.map(feature => ({ name: feature.properties?.[config.geoKey?.name ?? 'name'], value: null })),
  ];
  common.geo.itemStyle = { borderColor: '#ffffff', borderWidth: 1.5, areaColor: '#e6e6e6' };
  return {
    option: {
      ...common,
      graphic: [...common.graphic, legend.graphics],
      series: [
        {
          type: 'map',
          map: 'industry-map',
          geoIndex: 0,
          roam: false,
          selectedMode: false,
          label: { show: false },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1.5, areaColor: '#e6e6e6' },
          emphasis: { disabled: true },
          data: mapData,
        },
        {
          type: 'scatter',
          name: config.metricName ?? config.metricKey ?? '指标',
          coordinateSystem: 'geo',
          symbol: 'circle',
          symbolSize: value => diameters[classIndex(Array.isArray(value) ? value.at(-1) : value, classification)],
          itemStyle: { color: params => colors[classIndex(params.value?.at?.(-1) ?? params.value, classification)], opacity: 0.86, borderColor: config.paletteId === 'mixed-c' ? '#75808E' : '#FFFFFF', borderWidth: 2 },
          label: { show: false },
          data: records.filter(record => isFiniteNumber(record.value) && classIndex(record.value, classification) > 0).map(record => ({
            name: record.feature.properties?.[config.geoKey?.name ?? 'name'],
            displayName: labels.get(record.feature),
            value: [...interiorAnchor(record.feature.geometry), record.value],
          })),
        },
        labelLayer.series,
      ],
    },
    layout: { mode: 'bubble', nullColor: NULL_GRAY, palette: colors, diameters },
    classification,
    presentation: { labels: labelLayer.metadata, legend: legend.metadata, geography: common.geographicMetadata },
  };
}

function layout(config) {
  const publication = buildPublicationLayout({
    width: config.width ?? 3840, height: config.height ?? 2160,
    title: config.title, subtitle: config.subtitle, source: config.source, note: config.note,
  });
  return {
    animation: false,
    backgroundColor: '#ffffff',
    title: publication.title,
    graphic: publication.graphics,
    publication,
    geo: {
      map: 'industry-map', nameProperty: config.geoKey?.name ?? 'name', roam: false, ...publication.geo, silent: true,
      label: { show: false },
      emphasis: { disabled: true },
    },
  };
}

function resolveClassification(config, values) {
  const supplied = config.classification ?? {};
  const breaks = supplied.breaks ?? config.breaks;
  const thresholds = supplied.thresholds;
  const classes = config.classes ?? supplied.classes ?? 5;
  if (!values.length) throw new Error('choropleth requires at least one finite numeric value');
  const spansZero = values.some(value => value < 0) && values.some(value => value > 0);
  const classified = spansZero && !breaks && supplied.method !== 'custom'
    ? zeroCenteredDiverging(values, classes, supplied.source)
    : classifyValues(values, { classes, method: supplied.method ?? config.method ?? 'auto', breaks, thresholds, source: supplied.source });
  if (classified.method === 'custom' && classified.thresholds.length !== classes) throw new Error('custom classification requires one threshold per class');
  if (classified.method !== 'custom' && classified.breaks.length !== classes + 1) throw new Error('classification requires one more break endpoint than classes');
  if (classified.classCounts.reduce((total, count) => total + count, 0) !== values.length) throw new Error('Classification class counts must account for every joined metric');
  return classified;
}

function zeroCenteredDiverging(values, classes, source) {
  if (classes !== 5) return classifyValues(values, { classes, method: 'equal', source });
  const maximum = Math.max(...values.map(value => Math.abs(value)));
  const half = maximum / 2;
  const breaks = [-maximum, -half, 0, 0, half, maximum];
  const classCounts = Array(5).fill(0);
  for (const value of values) {
    const index = value < -half ? 0 : value < 0 ? 1 : value === 0 ? 2 : value <= half ? 3 : 4;
    classCounts[index] += 1;
  }
  return { method: 'diverging-equal', source: source ?? 'user-confirmed', intervalSemantics: 'left-closed-right-open', classes, breaks, classCounts, rationale: 'Zero-centered symmetric diverging intervals selected because metrics span negative and positive values.' };
}

function mapData(record, displayName, config, classification, palette) {
  return {
    name: record.feature.properties?.[config.geoKey?.name ?? 'name'],
    value: record.value,
    displayName,
    itemStyle: { areaColor: palette[classIndex(record.value, classification)] ?? palette.at(-1) },
  };
}

function classIndex(value, classification) {
  const boundaries = classification.method === 'custom' ? classification.thresholds : classification.breaks;
  const classCount = classification.classes;
  let index = classCount - 1;
  for (let candidate = 0; candidate < classCount - 1; candidate += 1) {
    if (value < boundaries[candidate + 1]) { index = candidate; break; }
  }
  return index;
}

function isFiniteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
