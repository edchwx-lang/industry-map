import ExcelJS from 'exceljs';

import { resolveBoundary } from './boundary-catalog.mjs';
import { templateWorkbookContract } from './template-workbook.mjs';

function cellText(cell) {
  return String(cell.value ?? '').trim();
}

export async function loadTemplateInput({ excelPath, skillRoot }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.getWorksheet(templateWorkbookContract.sheetName);
  const hidden = workbook.getWorksheet(templateWorkbookContract.metadataSheet);
  if (!sheet || !hidden) throw new Error('not an industry-map template workbook');
  const metadata = new Map();
  for (let row = 1; row <= 6; row += 1) metadata.set(cellText(hidden.getCell(row, 1)), cellText(hidden.getCell(row, 2)));
  const templateVersion = metadata.get('template_version');
  if (templateVersion !== templateWorkbookContract.version) throw new Error(`template version mismatch: ${templateVersion}`);
  const boundary = await resolveBoundary({
    skillRoot,
    id: metadata.get('boundary_id'),
    level: metadata.get('child_level'),
    parentAdcode: metadata.get('parent_adcode') || undefined,
  });
  if (metadata.get('boundary_sha256') !== boundary.provenance.sha256) throw new Error('template boundary hash mismatch');
  const identities = [];
  for (let row = 9; row <= hidden.rowCount; row += 1) {
    const adcode = cellText(hidden.getCell(row, 1));
    const name = cellText(hidden.getCell(row, 2));
    if (adcode || name) identities.push({ adcode, name });
  }
  const title = cellText(sheet.getCell('B2'));
  const metricName = cellText(sheet.getCell('B3'));
  const unit = cellText(sheet.getCell('B4'));
  if (!title || !metricName) throw new Error('template requires title and metric name');
  let defaultedZeroCount = 0;
  const rows = identities.map((identity, index) => {
    const visibleRow = index + 7;
    if (cellText(sheet.getCell(visibleRow, 1)) !== identity.name) throw new Error(`template region identity was modified at row ${visibleRow}`);
    const raw = sheet.getCell(visibleRow, 2).value;
    const blank = raw === null || raw === undefined || raw === '';
    if (!blank && (typeof raw !== 'number' || !Number.isFinite(raw))) throw new Error(`template metric must be a finite number at row ${visibleRow}`);
    if (blank) defaultedZeroCount += 1;
    return { adcode: identity.adcode, name: identity.name, value: blank ? 0 : raw, valueProvenance: blank ? 'defaulted_zero' : 'entered' };
  });
  return {
    adapterType: 'template',
    templateVersion,
    boundary: { ...boundary.provenance, path: boundary.path, parentAdcode: metadata.get('parent_adcode') },
    presentation: { title, metricName, unit },
    rows,
    defaultedZeroCount,
  };
}

