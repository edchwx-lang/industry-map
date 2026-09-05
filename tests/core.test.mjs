import assert from 'node:assert/strict';
import { link, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectInputs } from '../scripts/lib/input.mjs';
import { joinRecords } from '../scripts/lib/join.mjs';
import { classifyValues } from '../scripts/lib/classify.mjs';
import { resolvePalette } from '../scripts/lib/palettes.mjs';
import { featureCollection, messyRows } from './fixtures.mjs';

async function createInputs() {
  const XLSX = await import('xlsx');
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-'));
  const geojsonPath = join(directory, 'streets.geojson');
  const excelPath = join(directory, 'metrics.xlsx');
  await writeFile(geojsonPath, JSON.stringify(featureCollection));
  const sheet = XLSX.utils.aoa_to_sheet(messyRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '企业指标');
  XLSX.writeFile(workbook, excelPath);
  return { geojsonPath, excelPath };
}

async function createWorkbook(sheets) {
  const XLSX = await import('xlsx');
  const directory = await mkdtemp(join(tmpdir(), 'industry-map-workbook-'));
  const excelPath = join(directory, 'metrics.xlsx');
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  XLSX.writeFile(workbook, excelPath);
  return excelPath;
}

test('inspectInputs discovers usable GeoJSON fields and a messy workbook metric table', async () => {
  const paths = await createInputs();
  const report = await inspectInputs(paths);
  assert.equal(report.geojson.featureCount, 4);
  assert.deepEqual(report.geojson.propertyCandidates.map((item) => item.key), ['adcode', 'name']);
  assert.equal(report.workbook.tables[0].sheet, '企业指标');
  assert.equal(report.workbook.tables[0].headerRow, 2);
  assert.deepEqual(report.workbook.tables[0].metricCandidates.map((item) => item.key), ['企业数']);
  assert.deepEqual(report.requiredUserInputs, ['title', 'mode', 'unit', 'palette', 'classification']);
  assert.ok(report.warnings.some((warning) => warning.includes('合计')));
});

test('inspectInputs discovers independent table candidates on one sheet and reports excluded numeric text', async () => {
  const excelPath = await createWorkbook([['指标', [
    ['第一张表'],
    ['区域', '企业数'],
    ['甲', 3],
    ['乙', '7'],
    [],
    ['第二张表'],
    ['区域', '产值'],
    ['丙', 9],
    ['丁', 11],
  ]]]);
  const paths = await createInputs();
  const report = await inspectInputs({ geojsonPath: paths.geojsonPath, excelPath });
  assert.equal(report.workbook.tables.length, 2);
  assert.deepEqual(report.workbook.tables.map((table) => table.headerRow), [2, 7]);
  assert.equal(report.workbook.tables[0].metricCandidates[0].numericTextExcludedCount, 1);
  assert.deepEqual(report.requiredUserInputs, ['title', 'mode', 'unit', 'palette', 'classification', 'table', 'metric']);
  assert.ok(report.warnings.some((warning) => warning.includes('numeric text')));
});

test('inspect CLI rejects a normalized JSON output path that targets an input', async () => {
  const paths = await createInputs();
  const before = await readFile(paths.geojsonPath, 'utf8');
  const cliPath = resolve('scripts/industry-map.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'inspect', '--geojson', './streets.geojson', '--excel', './metrics.xlsx', '--json', './streets.geojson'], {
    cwd: resolve(paths.geojsonPath, '..'),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not target an input/i);
  assert.equal(await readFile(paths.geojsonPath, 'utf8'), before);
});

test('inspect CLI rejects a case-only Windows JSON alias of an input', async () => {
  const paths = await createInputs();
  const before = await readFile(paths.geojsonPath, 'utf8');
  const cliPath = resolve('scripts/industry-map.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'inspect', '--geojson', './streets.geojson', '--excel', './metrics.xlsx', '--json', './STREETS.GEOJSON'], {
    cwd: resolve(paths.geojsonPath, '..'),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not target an input/i);
  assert.equal(await readFile(paths.geojsonPath, 'utf8'), before);
});

test('inspect CLI rejects a symbolic-link directory alias of an input', async () => {
  const paths = await createInputs();
  const aliasDirectory = join(resolve(paths.geojsonPath, '..'), 'input-directory-alias');
  await symlink(resolve(paths.geojsonPath, '..'), aliasDirectory, 'junction');
  const before = await readFile(paths.geojsonPath, 'utf8');
  const result = spawnSync(process.execPath, [resolve('scripts/industry-map.mjs'), 'inspect', '--geojson', './streets.geojson', '--excel', './metrics.xlsx', '--json', './input-directory-alias/streets.geojson'], {
    cwd: resolve(paths.geojsonPath, '..'),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not target an input/i);
  assert.equal(await readFile(paths.geojsonPath, 'utf8'), before);
});

test('inspect CLI rejects a hard-link JSON alias of an input', async () => {
  const paths = await createInputs();
  const aliasPath = join(resolve(paths.geojsonPath, '..'), 'geojson-hard-link.json');
  await link(paths.geojsonPath, aliasPath);
  const before = await readFile(paths.geojsonPath, 'utf8');
  const result = spawnSync(process.execPath, [resolve('scripts/industry-map.mjs'), 'inspect', '--geojson', './streets.geojson', '--excel', './metrics.xlsx', '--json', './geojson-hard-link.json'], {
    cwd: resolve(paths.geojsonPath, '..'),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not target an input/i);
  assert.equal(await readFile(paths.geojsonPath, 'utf8'), before);
});

test('joinRecords uses exact code and name joins, applies explicit aliases, and preserves zero', () => {
  const result = joinRecords({
    features: featureCollection.features,
    rows: [
      { code: '441900001', region: '松山湖', value: 0 },
      { code: '441900002', region: '南城街道', value: 12 },
      { code: '', region: '东城街道', value: 30 },
      { code: '441900004', region: '万江街道', value: 5 },
    ],
    geoKey: { code: 'adcode', name: 'name' },
    rowKey: { code: 'code', name: 'region' },
    metricKey: 'value',
    aliases: [{ excel: '松山湖', geo: '莞城街道', display: '松山湖' }],
  });
  assert.equal(result.matchedFeatures.length, 4);
  assert.equal(result.matchedFeatures[0].value, 0);
  assert.equal(result.matchedFeatures[0].displayName, '松山湖');
  assert.deepEqual(result.aliasApplications, [{ excel: '松山湖', geo: '莞城街道', display: '松山湖' }]);
  assert.deepEqual(result.unmatchedRows, []);
  assert.deepEqual(result.unmatchedFeatures, []);
});

test('joinRecords reports unmatched input rows and duplicate keys as blocking diagnostics', () => {
  const result = joinRecords({
    features: featureCollection.features.slice(0, 1),
    rows: [
      { code: '441900001', region: '莞城街道', value: 1 },
      { code: '441900001', region: '莞城街道', value: 2 },
      { code: '999', region: '不存在街道', value: 3 },
    ],
    geoKey: { code: 'adcode', name: 'name' },
    rowKey: { code: 'code', name: 'region' },
    metricKey: 'value',
    aliases: [],
  });
  assert.equal(result.duplicates.rows.length, 1);
  assert.equal(result.unmatchedRows.length, 1);
  assert.equal(result.blocking, true);
});

test('joinRecords blocks when GeoJSON features have no matching table row', () => {
  const result = joinRecords({
    features: featureCollection.features.slice(0, 1),
    rows: [],
    geoKey: { code: 'adcode', name: 'name' },
    rowKey: { code: 'code', name: 'region' },
    metricKey: 'value',
    aliases: [],
  });
  assert.equal(result.unmatchedFeatures.length, 1);
  assert.equal(result.blocking, true);
});

test('classifyValues produces deterministic five equal-interval classes with sorted breaks', () => {
  const result = classifyValues([0, 5, 12, 30, 50], { classes: 5, method: 'equal' });
  assert.equal(result.method, 'equal');
  assert.deepEqual(result.breaks, [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(result.classCounts, [2, 1, 0, 1, 1]);
  assert.match(result.rationale, /equal/i);
});

test('classifyValues assigns Jenks boundary values to their ckmeans group', () => {
  const result = classifyValues([0, 1, 2, 100, 101, 102, 1000], { classes: 3, method: 'jenks' });
  assert.deepEqual(result.breaks, [0, 2, 102, 1000]);
  assert.deepEqual(result.classCounts, [3, 3, 1]);
});

test('classification supports exactly 3 through 7 classes', () => {
  for (const classes of [3, 4, 5, 6, 7]) {
    for (const method of ['equal', 'quantile', 'jenks']) {
      const result = classifyValues([0, 1, 2, 3, 4, 5, 6, 7, 8], { classes, method });
      assert.equal(result.classes, classes);
      assert.equal(result.breaks.length, classes + 1);
      assert.equal(result.classCounts.reduce((sum, count) => sum + count, 0), 9);
    }
  }
  for (const classes of [0, 1, 2, 8]) assert.throws(() => classifyValues([1, 2], { classes }), /3.*7/);
});

test('custom thresholds are left-closed right-open and the final class is open-ended', () => {
  const result = classifyValues([0, 4, 5, 14, 15, 24, 25, 34, 35, 100], {
    classes: 5,
    method: 'custom',
    thresholds: [0, 5, 15, 25, 35],
  });
  assert.equal(result.breaks, undefined);
  assert.deepEqual(result.thresholds, [0, 5, 15, 25, 35]);
  assert.deepEqual(result.classCounts, [2, 2, 2, 2, 2]);
  assert.equal(result.intervalSemantics, 'left-closed-right-open');
});

test('custom thresholds require a zero start for nonnegative data and strict ascending order', () => {
  assert.throws(() => classifyValues([0, 2, 8], { classes: 3, method: 'custom', thresholds: [1, 5, 9] }), /start.*0/i);
  assert.throws(() => classifyValues([0, 2, 8], { classes: 3, method: 'custom', thresholds: [0, 5, 5] }), /strictly increasing/i);
  assert.throws(() => classifyValues([0, 2, 8], { classes: 3, method: 'custom', thresholds: [0, 5] }), /3.*threshold/i);
});

test('approved V1 palettes keep exact five anchors and interpolate other class counts', () => {
  assert.deepEqual(resolvePalette({ paletteId: 'blue-a', classes: 5 }), ['#EFF4FC', '#D9E5F7', '#B5CCED', '#88ACE0', '#5685C5']);
  assert.deepEqual(resolvePalette({ paletteId: 'orange-a', classes: 5 }), ['#FFF3E6', '#FFD8AE', '#F6B66C', '#E68532', '#B94B1C']);
  assert.deepEqual(resolvePalette({ paletteId: 'mixed-c', classes: 5 }), ['#F7F7F7', '#92C5DE', '#0571B0', '#F4A582', '#CA0020']);
  for (const classes of [3, 4, 6, 7]) {
    const colors = resolvePalette({ paletteId: 'blue-a', classes });
    assert.equal(colors.length, classes);
    assert.equal(colors[0], '#EFF4FC');
    assert.equal(colors.at(-1), '#5685C5');
    assert.ok(colors.every(color => /^#[0-9A-F]{6}$/.test(color)));
  }
  assert.throws(() => resolvePalette({ paletteId: 'unknown', classes: 5 }), /blue-a.*orange-a.*mixed-c/);
});
