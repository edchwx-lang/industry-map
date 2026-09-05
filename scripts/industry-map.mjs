import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { inspectInputs, loadSelectedTable } from './lib/input.mjs';
import { sameFileTarget } from './lib/same-file-target.mjs';
import { joinRecords } from './lib/join.mjs';
import { applyRegionGroups } from './lib/region-groups.mjs';
import { buildChartOption } from './lib/options.mjs';
import { exportArtifacts } from './lib/export.mjs';
import { writeAuditWorkbook } from './lib/audit.mjs';
import { listBoundaries, resolveBoundary } from './lib/boundary-catalog.mjs';
import { readSkillVersion } from './lib/version.mjs';
import { resolvePlaceChildren } from './lib/place-resolver.mjs';
import { createTemplateWorkbook } from './lib/template-workbook.mjs';
import { loadTemplateInput } from './lib/template-input.mjs';
import { createMapJob } from './lib/map-job.mjs';
import { validatePresentationConfig } from './lib/presentation-config.mjs';

const skillRoot = resolve(import.meta.dirname, '..');

const [command, ...argumentsList] = process.argv.slice(2);
const nestedCommand = ['boundary', 'template'].includes(command);
const subcommandAction = nestedCommand ? argumentsList[0] : undefined;
const options = parseOptions(nestedCommand ? argumentsList.slice(1) : argumentsList);
if (command === 'inspect') await inspect(options);
else if (command === 'render') await render(options);
else if (command === 'boundary') await boundary(options, subcommandAction);
else if (command === 'template') await template(options, subcommandAction);
else if (command === 'version') process.stdout.write(`${JSON.stringify(await readSkillVersion(skillRoot))}\n`);
else throw new Error('Usage: inspect --geojson <path> --excel <path> [--json <path>] | render --config <resolved.json> [--force] | boundary list|resolve');

async function template(options, action) {
  if (action !== 'create' || !options.place || !options.output) throw new Error('template create requires --place and --output');
  const resolvedPlace = await resolvePlaceChildren({ skillRoot, place: options.place, parentAdcode: options['parent-adcode'] });
  const result = await createTemplateWorkbook({ resolvedPlace, outputPath: options.output });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function boundary(options, action) {
  if (action === 'list') {
    process.stdout.write(`${JSON.stringify(await listBoundaries({ skillRoot }), null, 2)}\n`);
    return;
  }
  if (action === 'resolve') {
    const result = await resolveBoundary({ skillRoot, level: options.level, parentAdcode: options['parent-adcode'], id: options.id, explicitPath: options.geojson });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (action === 'fetch-town') {
    const result = await resolveBoundary({
      skillRoot, level: 'town', parentAdcode: options['parent-adcode'], allowFetch: true,
      parentNames: { province: options.province, city: options.city, county: options.county },
      baseUrl: options['base-url'],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error('boundary requires list, resolve, or fetch-town');
}

async function inspect(options) {
  if (!options.geojson || !options.excel) throw new Error('inspect requires --geojson and --excel');
  const geojsonPath = resolve(options.geojson);
  const excelPath = resolve(options.excel);
  const jsonPath = options.json ? resolve(options.json) : undefined;
  if (jsonPath && await sameFileTarget(jsonPath, [geojsonPath, excelPath])) throw new Error('--json must not target an input file');
  const report = await inspectInputs({ geojsonPath, excelPath });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(output);
  if (jsonPath) await writeFile(jsonPath, output, 'utf8');
}

async function render(options) {
  if (!options.config) throw new Error('render requires --config <resolved.json>');
  const configPath = resolve(options.config);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateConfig(config);
  const root = dirname(configPath);
  const templatePath = config.templatePath ? resolve(root, config.templatePath) : undefined;
  const templateInput = templatePath ? await loadTemplateInput({ excelPath: templatePath, skillRoot }) : undefined;
  const mapJob = templateInput ? createMapJob({
    input: templateInput, mode: config.mode, classes: config.classes,
    classification: config.classification, paletteId: config.paletteId,
  }) : undefined;
  const resolvedConfig = mapJob ? {
    ...config,
    title: mapJob.presentation.title,
    metricName: mapJob.presentation.metricName,
    unit: mapJob.presentation.unit,
    classes: mapJob.classes,
    classification: mapJob.classification,
    paletteId: mapJob.paletteId,
    geoKey: { code: 'adcode', name: 'name' },
    rowKey: { code: 'adcode', name: 'name' },
    metricKey: 'value',
    aliases: [],
    inputMetadata: {
      adapterType: mapJob.adapterType,
      templateVersion: mapJob.templateVersion,
      boundaryHash: mapJob.boundary.sha256,
      defaultedZeroCount: mapJob.defaultedZeroCount,
    },
  } : config;
  const resolvedBoundary = mapJob
    ? { path: mapJob.boundary.path, provenance: mapJob.boundary }
    : config.boundary
    ? await resolveBoundary({
      skillRoot, level: config.boundary.level, parentAdcode: config.boundary.parentAdcode, id: config.boundary.id,
      allowFetch: config.boundary.allowFetch === true, parentNames: config.boundary.parentNames,
    })
    : { path: resolve(root, config.geojsonPath), provenance: { kind: 'explicit-file', source: 'explicit-file' } };
  const geojsonPath = resolvedBoundary.path;
  const excelPath = templatePath ?? resolve(root, config.excelPath);
  const sourceGeojson = JSON.parse(await readFile(geojsonPath, 'utf8'));
  const selectedCodes = mapJob ? new Set(mapJob.rows.map(row => String(row.adcode))) : undefined;
  const geojson = selectedCodes
    ? { ...sourceGeojson, features: sourceGeojson.features.filter(feature => selectedCodes.has(String(feature.properties?.adcode ?? ''))) }
    : sourceGeojson;
  validateGeojson(geojson);
  const selectedTable = mapJob ? { rows: mapJob.rows, warnings: [] } : await loadSelectedTable({ excelPath, sheet: config.sheet ?? config.table?.sheet, headerRow: config.headerRow ?? config.table?.headerRow, dataRange: config.dataRange ?? config.table?.dataRange });
  const { rows } = selectedTable;
  const joined = joinRecords({ features: geojson.features, rows, geoKey: resolvedConfig.geoKey, rowKey: resolvedConfig.rowKey, metricKey: resolvedConfig.metricKey, aliases: resolvedConfig.aliases ?? [] });
  if (joined.unmatchedRows.length || joined.duplicates.rows.length || joined.duplicates.features.length) throw new Error('Render stopped because rows are unmatched or join keys are duplicated');
  if (joined.matchedFeatures.some(record => typeof record.value !== 'number' || !Number.isFinite(record.value))) throw new Error('Selected metric values must be finite numbers');
  applyRegionGroups(geojson, joined, resolvedConfig);
  const built = buildChartOption(resolvedConfig, joined);
  const outputDir = resolve(root, config.outputDir);
  const slug = config.slug ?? 'industry-map';
  const force = options.force === true;
  const contract = [`${slug}.png`, `${slug}.svg`, `${slug}.pdf`, 'data-audit.xlsx', 'map-config.resolved.json', 'render-report.json'].map(file => join(outputDir, file));
  await guardOutputTargets(contract, [configPath, geojsonPath, excelPath]);
  if (!force) await rejectExisting(contract);
  await mkdir(outputDir, { recursive: true });
  const artifacts = await exportArtifacts({ option: built.option, geojson, outputDir, slug, width: config.width ?? 3840, height: config.height ?? 2160, force });
  await writeAuditWorkbook(join(outputDir, 'data-audit.xlsx'), joined, built.classification, resolvedConfig);
  await atomicJson(join(outputDir, 'map-config.resolved.json'), resolvedConfig);
  const report = {
    sourceHashes: { geojson: await sha256(geojsonPath), excel: await sha256(excelPath), config: await sha256(configPath) },
    join: { featureCount: geojson.features.length, rowCount: rows.length, matchedCount: joined.matchedFeatures.length, unmatchedRowCount: joined.unmatchedRows.length, unmatchedFeatureCount: joined.unmatchedFeatures.length, coverage: geojson.features.length ? joined.matchedFeatures.length / geojson.features.length : 0 },
    classification: built.classification,
    presentation: built.presentation,
    rendererVersions: { node: process.version, echarts: artifacts.echarts, browser: artifacts.browser },
    warnings: [...selectedTable.warnings, ...(joined.unmatchedFeatures.length ? [`${joined.unmatchedFeatures.length} GeoJSON feature(s) have null metrics`] : [])],
    boundary: resolvedBoundary.provenance,
    input: resolvedConfig.inputMetadata ?? { adapterType: 'flexible-excel', defaultedZeroCount: 0 },
    artifacts: await artifactMetadata(artifacts),
  };
  await atomicJson(join(outputDir, 'render-report.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function parseOptions(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    parsed[key] = key === 'force' ? true : values[++index];
  }
  return parsed;
}
function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Resolved config must be an object');
  validatePresentationConfig(config);
  if (!config.outputDir) throw new Error('Resolved config requires outputDir');
  if (config.labels && Object.hasOwn(config.labels, 'showValues') && typeof config.labels.showValues !== 'boolean') throw new Error('labels.showValues must be boolean');
  if (config.templatePath) {
    if (config.excelPath || config.geojsonPath || config.boundary) throw new Error('templatePath cannot be combined with flexible input paths');
  } else {
    if (Boolean(config.geojsonPath) === Boolean(config.boundary)) throw new Error('Resolved config requires exactly one of geojsonPath or boundary');
    if (!config.excelPath) throw new Error('Resolved config requires excelPath');
  }
  if (config.templatePath) {
    if (Object.hasOwn(config, 'title') || Object.hasOwn(config, 'metricName') || Object.hasOwn(config, 'unit')) throw new Error('template presentation fields must be edited inside the template workbook');
    if (Object.hasOwn(config, 'force')) throw new Error('config.force is not supported; use CLI --force');
    return;
  }
  if (config.boundary && (!config.boundary.level || typeof config.boundary !== 'object')) throw new Error('Resolved config boundary requires level');
  const table = config.table ?? config;
  if (!table.sheet || !Number.isInteger(table.headerRow) || !table.dataRange) throw new Error('Resolved config requires selected sheet, headerRow, and dataRange');
  for (const key of ['geoKey', 'rowKey']) if (!config[key]?.name) throw new Error(`Resolved config requires ${key}.name; ${key}.code is optional`);
  if (!config.metricKey) throw new Error('Resolved config requires metricKey');
  if (!String(config.title ?? '').trim()) throw new Error('Resolved config requires a user-supplied title');
  if (Object.hasOwn(config, 'force')) throw new Error('config.force is not supported; use CLI --force');
}
function validateGeojson(geojson) {
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) throw new Error('GeoJSON must be a FeatureCollection');
  if (geojson.features.some(feature => !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type))) throw new Error('GeoJSON contains unsupported geometry');
}
async function rejectExisting(paths) {
  for (const path of paths) { try { await stat(path); throw new Error(`Output already exists and --force was not supplied: ${path}`); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
}
async function guardOutputTargets(targets, inputs) {
  for (const target of targets) if (await sameFileTarget(target, inputs)) throw new Error(`Output artifact must not target an input file: ${target}`);
}
async function atomicJson(path, value) { const temporary = `${path}.tmp-${process.pid}-${Date.now()}`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, path); }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function artifactMetadata(artifacts) {
  const toMetadata = async (path, extra = {}) => ({ path: path.split('\\').at(-1), size: (await stat(path)).size, ...extra });
  return { svg: await toMetadata(artifacts.svg), png: await toMetadata(artifacts.png, { width: artifacts.width, height: artifacts.height }), pdf: await toMetadata(artifacts.pdf) };
}
