import { readFile } from 'node:fs/promises';
import XLSX from 'xlsx';

const TOTAL_ROW = /^(合计|总计|total)$/i;

/** Inspect input files without modifying them. */
export async function inspectInputs({ geojsonPath, excelPath }) {
  const geojson = JSON.parse(await readFile(geojsonPath, 'utf8'));
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('GeoJSON must be a FeatureCollection');
  }
  const features = geojson.features;
  const propertyKeys = [...new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {})))];
  const unsupported = features.filter((feature) => !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type));
  const workbook = XLSX.readFile(excelPath, { cellDates: false });
  const warnings = [];
  const tables = workbook.SheetNames.flatMap((sheetName) => discoverTables(workbook.Sheets[sheetName], sheetName, warnings));
  const metricNames = new Set(tables.flatMap(table => table.metricCandidates.map(candidate => candidate.key)));
  return {
    geojson: {
      featureCount: features.length,
      propertyCandidates: propertyKeys.map((key) => ({ key, nonEmptyCount: features.filter((f) => present(f.properties?.[key])).length })),
      geometryTypes: [...new Set(features.map((feature) => feature.geometry?.type))],
    },
    workbook: { sheets: workbook.SheetNames, tables },
    requiredUserInputs: ['title', 'mode', 'unit', 'palette', 'classification', ...(tables.length === 1 ? [] : ['table']), ...(metricNames.size === 1 ? [] : ['metric'])],
    warnings: unsupported.length ? [...warnings, `${unsupported.length} unsupported geometry feature(s)`] : warnings,
  };
}

/** Load the explicitly selected workbook table into normalized row objects. */
export async function loadSelectedTable({ excelPath, sheet, headerRow, dataRange }) {
  if (!sheet || !Number.isInteger(headerRow) || headerRow < 1) throw new Error('Selected table requires sheet and a 1-based headerRow');
  const startRow = dataRange?.startRow ?? dataRange?.start;
  const endRow = dataRange?.endRow ?? dataRange?.end;
  if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow <= headerRow || endRow < startRow) {
    throw new Error('Selected table requires an inclusive dataRange after the header row');
  }
  const workbook = XLSX.readFile(excelPath, { cellDates: false });
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error(`Workbook sheet not found: ${sheet}`);
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, blankrows: true });
  const headers = matrix[headerRow - 1]?.map(value => String(value ?? '').trim());
  if (!headers?.length || headers.filter(Boolean).length !== headers.length || new Set(headers).size !== headers.length) {
    throw new Error('Selected header row must contain unique nonempty field names');
  }
  const selected = matrix.slice(startRow - 1, endRow).filter(row => row.some(present));
  const rows = selected.filter(row => !isSummaryRow(row)).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
  const excludedSummaryCount = selected.length - rows.length;
  return { rows, warnings: excludedSummaryCount ? [`${sheet}: excluded ${excludedSummaryCount} summary row(s) from selected data range`] : [] };
}

function discoverTables(sheet, sheetName, warnings) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
  const tables = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const labels = row.map(value => typeof value === 'string' ? value.trim() : '');
    const nonEmpty = labels.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const nextRows = [];
    for (let rowIndex = index + 1; rowIndex < rows.length && rows[rowIndex].some(present); rowIndex += 1) nextRows.push(rows[rowIndex]);
    if (!nextRows.length) continue;
    const dataRows = nextRows.filter(candidate => !TOTAL_ROW.test(String(candidate[0] ?? '').trim()));
    const metricCandidates = labels.flatMap((label, column) => {
      if (!label) return [];
      const numbers = dataRows.map(rowValue => rowValue[column]).filter(value => typeof value === 'number' && Number.isFinite(value));
      const numericTextExcludedCount = dataRows.map(rowValue => rowValue[column]).filter(isNumericText).length;
      if (isIdentifierLabel(label)) {
        if (numericTextExcludedCount) warnings.push(`${sheetName}: ${label} is an identifier column with ${numericTextExcludedCount} numeric text value(s)`);
        return [];
      }
      if (numericTextExcludedCount) warnings.push(`${sheetName}: ${label} excluded ${numericTextExcludedCount} numeric text value(s)`);
      if (!numbers.length) return [];
      return [{ key: label, column, numericCount: numbers.length, numericTextExcludedCount }];
    });
    if (!metricCandidates.length) continue;
    if (nextRows.length !== dataRows.length) warnings.push(`${sheetName}: ignored 合计/total row(s)`);
    tables.push({ sheet: sheetName, headerRow: index + 1, rowCount: dataRows.length, columns: labels.filter(Boolean), metricCandidates });
  }
  return tables;
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isSummaryRow(row) {
  return TOTAL_ROW.test(String(row.find(present) ?? '').trim());
}

function isNumericText(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isIdentifierLabel(label) {
  return /(?:code|代码|编码|行政区划|区域|街道|名称|name)/i.test(label);
}
