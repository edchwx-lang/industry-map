import { mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import XLSX from 'xlsx';

/** Write the complete, human-readable workbook audit without modifying inputs. */
export async function writeAuditWorkbook(path, joinResult, classification, config) {
  await mkdir(dirname(path), { recursive: true });
  const workbook = XLSX.utils.book_new();
  append(workbook, 'summary', [
    { field: 'mode', value: config.mode },
    { field: 'adapter_type', value: config.inputMetadata?.adapterType ?? 'flexible-excel' },
    { field: 'template_version', value: config.inputMetadata?.templateVersion ?? '' },
    { field: 'boundary_hash', value: config.inputMetadata?.boundaryHash ?? '' },
    { field: 'defaulted_zero_count', value: config.inputMetadata?.defaultedZeroCount ?? 0 },
    { field: 'matched_count', value: joinResult.matchedFeatures.length },
    { field: 'unmatched_row_count', value: joinResult.unmatchedRows.length },
    { field: 'unmatched_feature_count', value: joinResult.unmatchedFeatures.length },
    { field: 'classification_method', value: classification.method },
    { field: 'classification_source', value: classification.source ?? '' },
    { field: 'interval_semantics', value: classification.intervalSemantics ?? '' },
    { field: 'breaks', value: classification.breaks ? JSON.stringify(classification.breaks) : '' },
    { field: 'thresholds', value: classification.thresholds ? JSON.stringify(classification.thresholds) : '' },
    { field: 'class_counts', value: JSON.stringify(classification.classCounts) },
  ]);
  append(workbook, 'matched', joinResult.matchedFeatures.map(record => ({
    geo_name: record.feature.properties?.[config.geoKey?.name ?? 'name'],
    display_name: record.displayName,
    value: record.value,
    value_provenance: record.row?.valueProvenance ?? 'entered',
    row: JSON.stringify(record.row),
  })));
  append(workbook, 'unmatched', [
    ...joinResult.unmatchedRows.map(row => ({ type: 'row', value: JSON.stringify(row) })),
    ...joinResult.unmatchedFeatures.map(feature => ({ type: 'feature', value: JSON.stringify(feature.properties ?? {}) })),
  ]);
  append(workbook, 'duplicates', [
    ...joinResult.duplicates.rows.map(duplicate => ({ type: 'row', key: duplicate.key, entries: JSON.stringify(duplicate.items) })),
    ...joinResult.duplicates.features.map(duplicate => ({ type: 'feature', key: duplicate.key, entries: JSON.stringify(duplicate.items.map(item => item.properties ?? {})) })),
  ]);
  append(workbook, 'aliases', joinResult.aliasApplications.map(alias => ({ excel: alias.excel, geo: alias.geo, display: alias.display })));
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  XLSX.writeFile(workbook, temporary);
  await rename(temporary, path);
}

function append(workbook, name, rows) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}
