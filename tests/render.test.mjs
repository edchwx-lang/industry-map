import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { loadSelectedTable } from '../scripts/lib/input.mjs';
import { buildChartOption } from '../scripts/lib/options.mjs';
import { exportArtifacts } from '../scripts/lib/export.mjs';
import { writeAuditWorkbook } from '../scripts/lib/audit.mjs';
import { buildPublicationLayout, bubbleDiameters } from '../scripts/lib/layout.mjs';
import { interiorAnchor } from '../scripts/lib/geometry.mjs';
import { buildLabelSeries } from '../scripts/lib/labels.mjs';
import { buildLegendGraphics, formatClassIntervals, formatLegendTitle } from '../scripts/lib/legend.mjs';
import { featureCollection } from './fixtures.mjs';

const joined = {
  matchedFeatures: featureCollection.features.slice(0, 3).map((feature, index) => ({
    feature,
    value: [0, 9, 36][index],
    displayName: feature.properties.name,
    row: { code: feature.properties.adcode, region: feature.properties.name, value: [0, 9, 36][index] },
  })),
  unmatchedRows: [],
  unmatchedFeatures: [featureCollection.features[3]],
  duplicates: { rows: [], features: [] },
  aliasApplications: [{ excel: '松山湖', geo: '莞城街道', display: '松山湖' }],
  blocking: false,
};

function config(overrides = {}) {
  const base = {
    mode: 'choropleth',
    paletteId: 'blue-a',
    title: 'Synthetic industry map',
    metricName: '企业数量',
    subtitle: 'Enterprise count',
    source: 'Synthetic source',
    unit: 'firms',
    classes: 5,
    classification: { method: 'equal', source: 'user-confirmed', breaks: [0, 10, 20, 30, 40, 50], classCounts: [2, 1, 0, 1, 1] },
  };
  return {
    ...base,
    ...overrides,
    classification: overrides.classification
      ? { source: 'user-confirmed', ...overrides.classification }
      : base.classification,
  };
}

test('buildChartOption requires an explicit supported map mode', () => {
  assert.throws(() => buildChartOption(config({ mode: undefined }), joined), /mode.*choropleth.*bubble/i);
  assert.throws(() => buildChartOption(config({ mode: 'heatmap' }), joined), /mode.*choropleth.*bubble/i);
});

test('both modes use one reference-aligned publication layout centered over the canvas', () => {
  const choropleth = buildPublicationLayout({ width: 3840, height: 2160, title: '标题', mode: 'choropleth' });
  const bubble = buildPublicationLayout({ width: 3840, height: 2160, title: '标题', mode: 'bubble' });
  assert.deepEqual(choropleth.title, bubble.title);
  assert.equal(choropleth.title.top, 80);
  assert.equal(choropleth.title.textStyle.fontSize, 64);
  assert.equal(choropleth.geo.top, 250);
  assert.ok(choropleth.geo.top - (choropleth.title.top + choropleth.title.textStyle.fontSize) >= 90);
  assert.equal(choropleth.title.left, 1920);
  assert.equal(choropleth.title.padding, 0);
  assert.match(choropleth.title.textStyle.fontFamily, /宋体|Source Han Serif/);
  assert.doesNotMatch(choropleth.title.textStyle.fontFamily, /["']/);
  assert.equal(choropleth.legendFrame.align, 'lower-right');
  assert.ok(choropleth.legendFrame.x > choropleth.mapFrame.right);
  assert.equal(choropleth.subtitle, undefined);
  assert.deepEqual(choropleth.graphics, []);
});

test('publication layout scales numeric frames proportionally on an 800 by 450 canvas', () => {
  const large = buildPublicationLayout({ width: 3840, height: 2160, title: '标题' });
  const small = buildPublicationLayout({ width: 800, height: 450, title: '标题' });
  const scale = 800 / 3840;
  for (const key of ['left', 'right', 'top', 'bottom', 'centerX']) {
    assert.ok(Math.abs(small.mapFrame[key] - Math.round(large.mapFrame[key] * scale)) <= 1, key);
  }
  for (const key of ['x', 'y', 'width', 'rowHeight', 'titleGap', 'bottom']) {
    assert.ok(Math.abs(small.legendFrame[key] - Math.round(large.legendFrame[key] * scale)) <= 1, key);
  }
});

test('bubble class diameters use equal-area spacing from 32 to 144', () => {
  for (const classes of [3, 4, 5, 6, 7]) {
    const diameters = bubbleDiameters(classes);
    assert.equal(diameters[0], 32);
    assert.equal(diameters.at(-1), 144);
    const squared = diameters.map(value => value ** 2);
    const increments = squared.slice(1).map((value, index) => value - squared[index]);
    assert.ok(Math.max(...increments) - Math.min(...increments) < 1);
  }
});

test('legend title includes the metric and optional unit', () => {
  assert.equal(formatLegendTitle('企业总数', '家'), '企业总数（家）');
  assert.equal(formatLegendTitle('企业总数', ''), '企业总数');
});

test('legend intervals are non-overlapping for integer and decimal breaks', () => {
  assert.deepEqual(formatClassIntervals({ breaks: [2, 10, 12, 16, 24, 46] }, [2, 9, 10, 46]), ['0–9', '10–11', '12–15', '16–23', '24及以上']);
  assert.deepEqual(formatClassIntervals({ breaks: [0.5, 1.5, 2.5] }, [0.5, 2.5]), ['0–<1.5', '1.5及以上']);
});

test('custom threshold legends preserve left-closed right-open boundaries and an open final class', () => {
  const classification = { method: 'custom', thresholds: [0, 5, 15, 25, 35], classes: 5 };
  assert.deepEqual(formatClassIntervals(classification), ['0–<5', '5–<15', '15–<25', '25–<35', '35及以上']);
});

test('custom legends use rectangles for choropleth and increasing circles for bubbles', () => {
  const base = {
    classification: { breaks: [0, 10, 20, 30, 40, 50], classes: 5 },
    colors: ['#1', '#2', '#3', '#4', '#5'],
    metricName: '企业数量', unit: '家', values: [0, 9, 36],
    frame: { align: 'lower-right', x: 3300, y: 1380, width: 430, rowHeight: 108, titleGap: 76, bottom: 120 },
  };
  const choropleth = buildLegendGraphics({ ...base, mode: 'choropleth' });
  const bubble = buildLegendGraphics({ ...base, mode: 'bubble', diameters: [32, 74, 101, 124, 144] });
  assert.equal(choropleth.metadata.type, 'rectangles');
  assert.equal(bubble.metadata.type, 'graduated-circles');
  assert.equal(choropleth.metadata.title, '企业数量（家）');
  assert.equal(choropleth.graphics.type, 'group');
  const rectangles = choropleth.graphics.children.filter(item => item.type === 'rect');
  const circles = bubble.graphics.children.filter(item => item.type === 'circle');
  assert.equal(rectangles.length, 5);
  assert.equal(circles.length, 5);
  assert.deepEqual(rectangles.map(item => item.style.fill), base.colors);
  assert.deepEqual(circles.map(item => item.style.fill), base.colors);
  assert.ok(circles.every((item, index) => index === 0 || item.shape.r > circles[index - 1].shape.r));
  assert.ok(choropleth.graphics.children[0].style.text.includes('企业数量'));
  assert.equal(choropleth.graphics.children[0].style.fontSize, 32);
  assert.equal(choropleth.graphics.children[0].style.fontWeight, 'normal');
  assert.match(choropleth.graphics.children[0].style.fontFamily, /宋体|Source Han Serif/);
  assert.ok(choropleth.graphics.x >= base.frame.x && choropleth.graphics.x + base.frame.width <= 3840);
});

test('interiorAnchor stays inside concave polygons and outside holes', () => {
  const concave = { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]]] };
  const [concaveX, concaveY] = interiorAnchor(concave);
  assert.ok(concaveX > 0 && concaveY > 0 && (concaveX < 1 || concaveY < 1));
  const holed = { type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
  ] };
  const [holeX, holeY] = interiorAnchor(holed);
  assert.ok(holeX < 3 || holeX > 7 || holeY < 3 || holeY > 7);
});

test('label layer emits every matched and unmatched region name without hiding overlaps', () => {
  const result = buildLabelSeries({ records: joined.matchedFeatures, unmatched: joined.unmatchedFeatures, geoNameKey: 'name', showValues: false, unit: '家', featureCount: 4 });
  assert.equal(result.metadata.mode, 'name');
  assert.equal(result.metadata.emittedLabelCount, 4);
  assert.deepEqual(result.series.data.map(item => item.displayText), ['莞城街道', '南城街道', '东城街道', '万江街道']);
  assert.equal(result.series.labelLayout.hideOverlap, false);
  assert.equal(result.series.label.fontSize, 28);
  assert.equal(result.series.label.textBorderWidth, 3);
  assert.equal(result.series.itemStyle.opacity, undefined);
  assert.equal(result.series.itemStyle.color, 'transparent');
});

test('value label mode preserves zero and leaves unmatched features name-only', () => {
  const result = buildLabelSeries({ records: joined.matchedFeatures, unmatched: joined.unmatchedFeatures, geoNameKey: 'name', showValues: true, unit: '家', featureCount: 4 });
  assert.deepEqual(result.series.data.map(item => item.displayText), ['莞城街道\n0 家', '南城街道\n9 家', '东城街道\n36 家', '万江街道']);
  assert.equal(result.metadata.mode, 'name-value');
});

test('label typography adapts but never suppresses dense feature names', () => {
  const medium = buildLabelSeries({ records: [], unmatched: Array(51).fill(featureCollection.features[0]), geoNameKey: 'name', featureCount: 51 });
  const dense = buildLabelSeries({ records: [], unmatched: Array(101).fill(featureCollection.features[0]), geoNameKey: 'name', featureCount: 101 });
  assert.equal(medium.series.label.fontSize, 24);
  assert.equal(dense.series.label.fontSize, 18);
  assert.equal(medium.series.data.length, 51);
  assert.equal(dense.series.data.length, 101);
  assert.ok(medium.metadata.densityWarnings.length > 0);
  assert.ok(dense.metadata.densityWarnings.length > 0);
});

test('label typography scales from the 4K baseline on an 800 by 450 canvas', () => {
  const result = buildLabelSeries({ records: joined.matchedFeatures, unmatched: joined.unmatchedFeatures, featureCount: 4, canvasScale: 800 / 3840 });
  assert.equal(result.series.label.fontSize, 6);
  assert.equal(result.series.label.textBorderWidth, 1);
});

test('custom legend typography and rectangle geometry scale on a preview canvas', () => {
  const frame = buildPublicationLayout({ width: 800, height: 450, title: '标题' }).legendFrame;
  const result = buildLegendGraphics({
    mode: 'choropleth', classification: { breaks: [0, 10, 20, 30, 40, 50], classes: 5 },
    colors: ['#1', '#2', '#3', '#4', '#5'], metricName: '企业数量', unit: '家', frame, values: [1, 50],
  });
  const title = result.graphics.children[0];
  const rectangle = result.graphics.children.find(item => item.type === 'rect');
  const interval = result.graphics.children.find((item, index) => item.type === 'text' && index > 0);
  assert.equal(title.style.fontSize, 8);
  assert.equal(rectangle.shape.width, 15);
  assert.equal(interval.x, 22);
});

test('buildChartOption supplies five-class choropleth metadata and gray null styling', () => {
  const result = buildChartOption(config(), joined);
  assert.equal(result.layout.mode, 'choropleth');
  assert.equal(result.classification.breaks.length, 6);
  assert.deepEqual(result.classification.classCounts, [2, 0, 0, 1, 0]);
  assert.equal(result.option.visualMap, undefined);
  assert.deepEqual(result.option.series[0].data.slice(0, 3).map(item => item.itemStyle.areaColor), ['#EFF4FC', '#EFF4FC', '#88ACE0']);
  assert.deepEqual(result.option.geo.regions.slice(0, 3).map(item => item.itemStyle.areaColor), ['#EFF4FC', '#EFF4FC', '#88ACE0']);
  assert.equal(result.option.geo.regions[3].itemStyle.areaColor, '#d9d9d9');
  assert.equal(result.option.series[0].geoIndex, 0);
  assert.equal(result.option.geo.label.show, false);
  assert.equal(result.option.series[0].data[3].value, null);
  assert.equal(result.option.series[0].data[3].itemStyle.areaColor, '#d9d9d9');
  assert.equal(result.option.series.at(-1).name, '__administrative_labels__');
  assert.equal(result.option.series.at(-1).data.length, 4);
  assert.deepEqual(result.presentation.labels, {
    mode: 'name', emittedLabelCount: 4, densityWarnings: [],
  });
  assert.equal(result.presentation.legend.type, 'rectangles');
  assert.equal(result.presentation.legend.title, '企业数量（firms）');
  assert.equal(result.option.graphic.at(-1).type, 'group');
});

test('buildChartOption uses explicit alias display names in choropleth labels', () => {
  const aliased = structuredClone(joined);
  aliased.matchedFeatures[0].displayName = '松山湖';
  const result = buildChartOption(config(), aliased);
  assert.equal(result.option.geo.label.show, false);
  assert.equal(result.option.series[0].label.show, false);
  assert.equal(result.option.series.at(-1).data[0].displayText, '松山湖');
});

test('buildChartOption computes class counts from joined values instead of accepting supplied counts', () => {
  const result = buildChartOption(config({ classification: { method: 'equal', breaks: [0, 10, 20, 30, 40, 50], classCounts: [99, 99, 99, 99, 99] } }), joined);
  assert.deepEqual(result.classification.classCounts, [2, 0, 0, 1, 0]);
  assert.equal(result.classification.classCounts.reduce((total, count) => total + count, 0), 3);
});

test('buildChartOption assigns custom threshold boundary values to the later class', () => {
  const customJoined = {
    ...joined,
    matchedFeatures: featureCollection.features.map((feature, index) => ({
      feature,
      value: [0, 5, 15, 35][index],
      displayName: feature.properties.name,
      row: {},
    })),
    unmatchedFeatures: [],
  };
  const result = buildChartOption(config({
    classification: { method: 'custom', source: 'user-defined', thresholds: [0, 5, 15, 25, 35] },
  }), customJoined);
  assert.deepEqual(result.classification.classCounts, [1, 1, 1, 0, 1]);
  assert.deepEqual(result.presentation.legend.intervals, ['0–<5', '5–<15', '15–<25', '25–<35', '35及以上']);
  assert.deepEqual(result.option.series[0].data.map(item => item.itemStyle.areaColor), result.classification.colors.filter((_, index) => index !== 3));
});

test('buildChartOption creates symmetric zero-centered diverging breaks for mixed-sign values', () => {
  const mixed = structuredClone(joined);
  mixed.matchedFeatures = mixed.matchedFeatures.map((record, index) => ({ ...record, value: [-2, 0, 4][index] }));
  const result = buildChartOption(config({ classification: { method: 'equal' } }), mixed);
  assert.equal(result.classification.method, 'diverging-equal');
  assert.deepEqual(result.classification.breaks, [-4, -2, 0, 0, 2, 4]);
  assert.equal(result.classification.classCounts.reduce((total, count) => total + count, 0), 3);
  assert.match(result.classification.rationale, /zero/i);
  assert.equal(result.option.visualMap, undefined);
  assert.equal(result.presentation.legend.intervals.length, 5);
});

test('buildChartOption uses the configured GeoJSON name property without mutation', async () => {
  const customFeature = structuredClone(featureCollection.features[0]);
  customFeature.properties = { adcode: customFeature.properties.adcode, name: 'Wrong district', district: 'Custom district' };
  const customJoined = { ...joined, matchedFeatures: [{ feature: customFeature, value: 12, displayName: 'Custom district', row: {} }], unmatchedFeatures: [] };
  const built = buildChartOption(config({ geoKey: { code: 'adcode', name: 'district' } }), customJoined);
  assert.equal(built.option.series[0].data[0].name, 'Custom district');
  const outputDir = await mkdtemp(join(tmpdir(), 'industry-map-custom-name-'));
  const artifacts = await exportArtifacts({ option: built.option, geojson: { type: 'FeatureCollection', features: [customFeature] }, outputDir, slug: 'custom-name', width: 800, height: 450, force: false });
  assert.match(await readFile(artifacts.svg, 'utf8'), /Custom district/);
  const { normalizeGeojsonForEcharts } = await import('../scripts/lib/export.mjs');
  assert.equal(normalizeGeojsonForEcharts({ type: 'FeatureCollection', features: [customFeature] }, 'district').features[0].properties.name, 'Custom district');
  assert.equal(customFeature.properties.name, 'Wrong district');
});

test('loadSelectedTable excludes a selected total row and reports it as a warning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-selected-table-'));
  const excelPath = join(directory, 'metrics.xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['产业指标'],
    ['代码', '名称', '企业数'],
    ['441900001', '莞城街道', 4],
    ['441900002', '南城街道', 9],
    ['合计', '', 13],
  ]), '指标');
  XLSX.writeFile(workbook, excelPath);
  const selected = await loadSelectedTable({ excelPath, sheet: '指标', headerRow: 2, dataRange: { startRow: 3, endRow: 5 } });
  assert.deepEqual(selected.rows.map(row => row.代码), ['441900001', '441900002']);
  assert.deepEqual(selected.warnings, ['指标: excluded 1 summary row(s) from selected data range']);
});

test('buildChartOption assigns discrete class sizes and colors to non-negative values', () => {
  const result = buildChartOption(config({ mode: 'bubble', paletteId: 'orange-a' }), joined);
  const diameter = result.option.series[1].symbolSize;
  assert.equal(diameter(9), 32);
  assert.ok(Math.abs(diameter(36) - Math.sqrt(1024 + 3 * (20736 - 1024) / 4)) < 1e-9);
  assert.equal(result.option.animation, false);
  assert.equal(result.option.series[0].itemStyle.areaColor, '#e6e6e6');
  assert.equal(result.option.visualMap, undefined);
  assert.deepEqual(result.classification.colors, ['#FFF3E6', '#FFD8AE', '#F6B66C', '#E68532', '#B94B1C']);
  assert.equal(result.option.series[1].data.some(item => item.value.at(-1) < 10), false);
  assert.equal(result.option.series[0].data.some(item => item.value === 0), true);
  assert.equal(result.presentation.legend.type, 'graduated-circles');
  assert.equal(result.presentation.legend.title, '企业数量（firms）');
  assert.equal(result.option.graphic.at(-1).children.filter(item => item.type === 'circle').length, 4);
  assert.equal(result.presentation.legend.lowestClassSymbol, 'base-map-only');
});

test('buildChartOption gives bubble maps the same complete administrative label layer', () => {
  const bubbleJoined = {
    ...joined,
    matchedFeatures: featureCollection.features.slice(1).map((feature, index) => ({
      feature,
      value: [9, 36, 4][index],
      displayName: feature.properties.name,
      row: {},
    })),
    unmatchedFeatures: [],
  };
  const result = buildChartOption(config({ mode: 'bubble' }), bubbleJoined);
  assert.equal(result.option.series[1].label.show, false);
  assert.equal(result.option.series.at(-1).name, '__administrative_labels__');
  assert.deepEqual(result.option.series.at(-1).data.map(item => item.displayText), ['南城街道', '东城街道', '万江街道']);
  assert.deepEqual(result.presentation.labels, {
    mode: 'name', emittedLabelCount: 3, densityWarnings: [],
  });
});

test('buildChartOption enables name-value labels only through labels.showValues', () => {
  const result = buildChartOption(config({ labels: { showValues: true }, unit: '家' }), joined);
  assert.deepEqual(result.option.series.at(-1).data.map(item => item.displayText), ['莞城街道\n0 家', '南城街道\n9 家', '东城街道\n36 家', '万江街道']);
  assert.equal(result.presentation.labels.mode, 'name-value');
});

test('buildChartOption rejects negative bubble values', () => {
  const negative = structuredClone(joined);
  negative.matchedFeatures[1].value = -1;
  assert.throws(() => buildChartOption(config({ mode: 'bubble' }), negative), /negative bubble/i);
});

test('buildChartOption falls back to an interior point for concave bubble geometry', () => {
  const feature = {
    type: 'Feature', properties: { name: 'Concave' },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]]] },
  };
  const result = buildChartOption(config({ mode: 'bubble' }), { ...joined, matchedFeatures: [{ feature, value: 25, displayName: 'Concave', row: {} }], unmatchedFeatures: [] });
  const [x, y] = result.option.series[1].data[0].value;
  assert.ok(x > 0 && y > 0 && (x < 1 || y < 1), `expected interior point, received ${x}, ${y}`);
});

test('buildChartOption keeps a bubble anchor out of polygon holes', () => {
  const feature = {
    type: 'Feature', properties: { name: 'Holed' },
    geometry: { type: 'Polygon', coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
    ] },
  };
  const result = buildChartOption(config({ mode: 'bubble' }), { ...joined, matchedFeatures: [{ feature, value: 25, displayName: 'Holed', row: {} }], unmatchedFeatures: [] });
  const [x, y] = result.option.series[1].data[0].value;
  assert.ok(x < 3 || x > 7 || y < 3 || y > 7, `expected anchor outside the hole, received ${x}, ${y}`);
});

test('browser discovery resolves an executable without launching it or touching the default profile', async t => {
  const { resolveBrowserExecutable } = await import('../scripts/lib/export.mjs');
  assert.equal(typeof resolveBrowserExecutable, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-discovery-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const launchMarker = join(directory, 'launched.txt');
  const candidate = join(directory, 'fake-browser.cmd');
  const localState = join(directory, 'Microsoft', 'Edge', 'User Data', 'Local State');
  await mkdir(resolve(localState, '..'), { recursive: true });
  await writeFile(localState, 'sentinel-default-profile-state', 'utf8');
  await writeFile(candidate, `@echo off\r\n>"${launchMarker}" echo launched\r\n`, 'utf8');

  const resolvedBrowser = await resolveBrowserExecutable({
    environment: { INDUSTRY_MAP_BROWSER: candidate, PATH: '', PATHEXT: '.CMD', LOCALAPPDATA: directory },
    platform: 'win32',
  });

  assert.equal(resolvedBrowser, candidate);
  assert.equal(await exists(launchMarker), false);
  assert.equal(await readFile(localState, 'utf8'), 'sentinel-default-profile-state');
});

test('browser render arguments isolate a fresh profile and disable account and background services', async () => {
  const { buildBrowserArguments } = await import('../scripts/lib/export.mjs');
  assert.equal(typeof buildBrowserArguments, 'function');
  const profile = 'C:\\isolated\\industry-map-browser-profile';
  const argumentsList = buildBrowserArguments(profile);
  for (const required of ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update']) {
    assert.ok(argumentsList.includes(required), `missing browser isolation flag: ${required}`);
  }
  assert.ok(argumentsList.includes(`--user-data-dir=${profile}`));
});

test('browser executable resolution is cached once per resolver process', async () => {
  const { createBrowserResolver } = await import('../scripts/lib/export.mjs');
  assert.equal(typeof createBrowserResolver, 'function');
  let resolutions = 0;
  const findBrowser = createBrowserResolver(async () => {
    resolutions += 1;
    return 'C:\\isolated\\browser.exe';
  });
  assert.equal(await findBrowser(), 'C:\\isolated\\browser.exe');
  assert.equal(await findBrowser(), 'C:\\isolated\\browser.exe');
  assert.equal(resolutions, 1);
});

test('exportArtifacts produces vector, raster, and PDF artifacts and refuses overwrites', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'industry-map-render-'));
  const built = buildChartOption(config(), joined);
  const artifacts = await exportArtifacts({
    option: built.option,
    geojson: featureCollection,
    outputDir,
    slug: 'synthetic-map',
    width: 3840,
    height: 2160,
    force: false,
  });
  const [svg, png, pdf] = await Promise.all([readFile(artifacts.svg, 'utf8'), readFile(artifacts.png), readFile(artifacts.pdf)]);
  assert.match(svg, /<path\b/i);
  assert.match(svg, /Synthetic industry map/);
  assert.doesNotMatch(svg, /font-family="[^"]*"[A-Za-z]/, 'font-family attribute must remain valid XML');
  assert.equal(png.readUInt32BE(16), 3840);
  assert.equal(png.readUInt32BE(20), 2160);
  assert.ok(pdf.length > 100);
  const pdfSource = pdf.toString('latin1');
  assert.equal([...pdfSource.matchAll(/\/Type\s*\/Page\b/g)].length, 1);
  const mediaBox = pdfSource.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(mediaBox, 'expected a PDF MediaBox');
  assert.ok(Math.abs(Number(mediaBox[1]) / Number(mediaBox[2]) - 16 / 9) < 0.01);
  await assert.rejects(
    exportArtifacts({ option: built.option, geojson: featureCollection, outputDir, slug: 'synthetic-map', width: 3840, height: 2160, force: false }),
    /already exists|overwrite/i,
  );
});

test('writeAuditWorkbook creates all required audit sheets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-audit-'));
  const path = join(directory, 'data-audit.xlsx');
  await writeAuditWorkbook(path, joined, config().classification, config());
  assert.deepEqual(XLSX.readFile(path).SheetNames, ['summary', 'matched', 'unmatched', 'duplicates', 'aliases']);
});

test('browser candidates cover macOS and Linux in deterministic priority order', async () => {
  const { browserCandidates } = await import('../scripts/lib/export.mjs');
  assert.deepEqual(browserCandidates({
    environment: { INDUSTRY_MAP_BROWSER: '/custom/browser', PATH: '/usr/local/bin:/usr/bin' },
    platform: 'darwin', homedirPath: '/Users/mapmaker',
  }).slice(0, 5), [
    '/custom/browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Users/mapmaker/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]);
  const linux = browserCandidates({ environment: { PATH: '/opt/bin:/usr/bin' }, platform: 'linux', homedirPath: '/home/mapmaker' });
  assert.deepEqual(linux.slice(0, 6), [
    '/opt/bin/google-chrome-stable', '/usr/bin/google-chrome-stable',
    '/opt/bin/google-chrome', '/usr/bin/google-chrome',
    '/opt/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge-stable',
  ]);
});

test('browser discovery checks POSIX executable permission and reports the platform', async () => {
  const checked = [];
  const candidate = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const resolved = await (await import('../scripts/lib/export.mjs')).resolveBrowserExecutable({
    environment: { PATH: '' }, platform: 'darwin', homedirPath: '/Users/mapmaker',
    statFile: async path => ({ isFile: () => path === candidate }),
    accessFile: async path => { checked.push(path); },
  });
  assert.equal(resolved, candidate);
  assert.deepEqual(checked, [candidate]);
  await assert.rejects(
    (await import('../scripts/lib/export.mjs')).resolveBrowserExecutable({
      environment: { PATH: '' }, platform: 'linux', homedirPath: '/home/mapmaker',
      statFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    }),
    /linux.*INDUSTRY_MAP_BROWSER/i,
  );
});

test('renderer file URLs use Node URL encoding for spaces', async () => {
  const { toFileUrl } = await import('../scripts/lib/export.mjs');
  const url = toFileUrl(resolve('map output', 'render.html'));
  assert.match(url, /^file:\/\/\//);
  assert.match(url, /map%20output/);
  assert.doesNotMatch(url, /\\/);
});

test('writeAuditWorkbook records custom classification provenance and thresholds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-audit-v12-'));
  const path = join(directory, 'data-audit.xlsx');
  const classification = {
    method: 'custom', source: 'user-defined', intervalSemantics: 'left-closed-right-open',
    thresholds: [0, 5, 15, 25, 35], classCounts: [2, 1, 0, 0, 0],
  };
  await writeAuditWorkbook(path, joined, classification, config());
  const summarySheet = XLSX.readFile(path).Sheets.summary;
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(summarySheet).map(row => [row.field, row.value]));
  assert.equal(summary.classification_source, 'user-defined');
  assert.equal(summary.interval_semantics, 'left-closed-right-open');
  assert.equal(summary.thresholds, '[0,5,15,25,35]');
});

test('render CLI writes the six-artifact contract and report fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-cli-'));
  const geojsonPath = join(directory, 'synthetic.geojson');
  const excelPath = join(directory, 'metrics.xlsx');
  const outputDir = join(directory, 'output');
  const configPath = join(directory, 'resolved.json');
  await writeFile(geojsonPath, JSON.stringify(featureCollection));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['行政区划代码', '街道名称', '企业数'],
    ...joined.matchedFeatures.map(({ row }) => [row.code, row.region, row.value]),
    ['合计', '', 45],
  ]), '指标');
  XLSX.writeFile(workbook, excelPath);
  await writeFile(configPath, JSON.stringify({
    ...config({ geojsonPath, outputDir, slug: 'cli-map', width: 3840, height: 2160 }),
    excelPath,
    sheet: '指标',
    headerRow: 1,
    dataRange: { startRow: 2, endRow: 5 },
    geoKey: { code: 'adcode', name: 'name' },
    rowKey: { code: '行政区划代码', name: '街道名称' },
    metricKey: '企业数',
    aliases: [],
  }));
  const result = await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(join(outputDir, 'render-report.json'), 'utf8'));
  assert.equal(report.join.featureCount, 4);
  assert.equal(report.join.matchedCount, 3);
  assert.deepEqual(report.classification.breaks, [0, 10, 20, 30, 40, 50]);
  assert.equal(report.classification.source, 'user-confirmed');
  assert.equal(report.classification.intervalSemantics, 'left-closed-right-open');
  assert.equal(report.artifacts.png.width, 3840);
  assert.ok(report.sourceHashes.geojson);
  assert.ok(report.sourceHashes.excel);
  assert.ok(report.warnings.some(warning => warning.includes('excluded 1 summary row')));
  assert.ok(report.rendererVersions.node);
  assert.deepEqual(report.presentation.labels, { mode: 'name', emittedLabelCount: 4, densityWarnings: [] });
  assert.equal(report.presentation.legend.type, 'rectangles');
  assert.equal(report.presentation.legend.title, '企业数量（firms）');
  assert.equal(report.presentation.legend.intervals.length, 5);
  await Promise.all(['cli-map.png', 'cli-map.svg', 'cli-map.pdf', 'data-audit.xlsx', 'map-config.resolved.json', 'render-report.json'].map(async file => stat(join(outputDir, file))));
});

test('render CLI rejects config.force and permits overwrite only with explicit --force', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-force-'));
  const geojsonPath = join(directory, 'synthetic.geojson');
  const excelPath = join(directory, 'metrics.xlsx');
  const outputDir = join(directory, 'output');
  const configPath = join(directory, 'resolved.json');
  await writeFile(geojsonPath, JSON.stringify(featureCollection));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['行政区划代码', '街道名称', '企业数'],
    ...featureCollection.features.map((feature, index) => [feature.properties.adcode, feature.properties.name, index + 1]),
  ]), '指标');
  XLSX.writeFile(workbook, excelPath);
  const resolved = {
    ...config({ geojsonPath, excelPath, outputDir, slug: 'force-map', width: 800, height: 450, classification: { method: 'equal', breaks: [1, 2, 3, 4, 5, 6] } }),
    sheet: '指标', headerRow: 1, dataRange: { startRow: 2, endRow: 5 },
    geoKey: { code: 'adcode', name: 'name' }, rowKey: { code: '行政区划代码', name: '街道名称' }, metricKey: '企业数', aliases: [],
  };
  await writeFile(configPath, JSON.stringify(resolved));
  assert.equal((await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath])).status, 0);
  await writeFile(configPath, JSON.stringify({ ...resolved, force: true }));
  const configForce = await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath]);
  assert.notEqual(configForce.status, 0);
  assert.match(configForce.stderr, /config\.force.*--force/i);
  await writeFile(configPath, JSON.stringify(resolved));
  assert.equal((await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath, '--force'])).status, 0);
});

test('render CLI rejects non-boolean labels.showValues before reading inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-label-config-'));
  const configPath = join(directory, 'invalid.json');
  await writeFile(configPath, JSON.stringify({
    mode: 'choropleth', paletteId: 'blue-a', classes: 5,
    classification: { method: 'auto', source: 'user-confirmed' },
    geojsonPath: 'missing.geojson', excelPath: 'missing.xlsx', outputDir: 'output',
    sheet: '指标', headerRow: 1, dataRange: { startRow: 2, endRow: 2 },
    geoKey: { name: 'name' }, rowKey: { name: '地区' }, metricKey: '企业数', title: '测试',
    labels: { showValues: 'yes' },
  }));
  const result = await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /labels\.showValues must be boolean/i);
});

test('render CLI never overwrites an Excel source that aliases data-audit.xlsx, even with --force', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-input-alias-'));
  const geojsonPath = join(directory, 'synthetic.geojson');
  const excelPath = join(directory, 'data-audit.xlsx');
  const configPath = join(directory, 'resolved.json');
  await writeFile(geojsonPath, JSON.stringify(featureCollection));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['代码', '名称', '企业数'],
    ...featureCollection.features.map((feature, index) => [feature.properties.adcode, feature.properties.name, index + 1]),
  ]), '指标');
  XLSX.writeFile(workbook, excelPath);
  const before = await readFile(excelPath);
  await writeFile(configPath, JSON.stringify({
    ...config({ geojsonPath, excelPath, outputDir: directory, slug: 'safe-map', width: 800, height: 450, classification: { method: 'equal', breaks: [1, 2, 3, 4, 5, 6] } }),
    sheet: '指标', headerRow: 1, dataRange: { startRow: 2, endRow: 5 },
    geoKey: { code: 'adcode', name: 'name' }, rowKey: { code: '代码', name: '名称' }, metricKey: '企业数', aliases: [],
  }));
  const result = await runProcess(process.execPath, [resolve('scripts/industry-map.mjs'), 'render', '--config', configPath, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not target an input file/i);
  assert.deepEqual(await readFile(excelPath), before);
  await Promise.all(['safe-map.png', 'safe-map.svg', 'safe-map.pdf', 'map-config.resolved.json', 'render-report.json'].map(async file => assert.equal(await exists(join(directory, file)), false)));
});

function runProcess(command, argumentsList, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Process did not finish within ${timeout}ms: ${command}`));
    }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

async function exists(path) { try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
