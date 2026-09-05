import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const TEMPLATE_VERSION = '1.0.0';
const SHEET_NAME = '产业地图数据模板';
const METADATA_SHEET = '_industry_map_metadata';

async function rejectExisting(outputPath) {
  try {
    await stat(outputPath);
    throw new Error(`template output already exists: ${outputPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function createTemplateWorkbook({ resolvedPlace, outputPath }) {
  if (!String(outputPath ?? '').toLowerCase().endsWith('.xlsx')) throw new Error('template output must use the .xlsx extension');
  const target = path.resolve(outputPath);
  await rejectExisting(target);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'industry-map V1';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 6 }] });
  sheet.columns = [{ width: 28 }, { width: 22 }];
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = `${resolvedPlace.place.name}产业热力图数据模板`;
  sheet.getCell('A2').value = '图名称';
  sheet.getCell('A3').value = '指标名称';
  sheet.getCell('A4').value = '单位';
  sheet.getCell('A6').value = '地区';
  sheet.getCell('B6').value = '指标值';
  for (const address of ['B2', 'B3', 'B4']) {
    sheet.getCell(address).protection = { locked: false };
    sheet.getCell(address).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }
  sheet.getRow(1).font = { name: '宋体', size: 18, bold: true };
  sheet.getRow(6).font = { name: '宋体', bold: true };
  resolvedPlace.regions.forEach((region, index) => {
    const row = index + 7;
    sheet.getCell(row, 1).value = region.name;
    sheet.getCell(row, 1).protection = { locked: true };
    sheet.getCell(row, 2).protection = { locked: false };
    sheet.getCell(row, 2).dataValidation = {
      type: 'decimal', operator: 'between', allowBlank: true,
      formulae: [-1e307, 1e307],
      showErrorMessage: true, errorTitle: '请输入数字', error: '指标值只能是数字或留空。',
    };
  });
  await sheet.protect('industry-map-v1', { selectLockedCells: false, selectUnlockedCells: true, formatCells: false, insertRows: false, deleteRows: false });

  const metadata = workbook.addWorksheet(METADATA_SHEET, { state: 'veryHidden' });
  const entries = [
    ['template_version', TEMPLATE_VERSION],
    ['place_adcode', resolvedPlace.place.adcode],
    ['boundary_id', resolvedPlace.boundary.id],
    ['child_level', resolvedPlace.childLevel],
    ['boundary_sha256', resolvedPlace.boundary.sha256],
    ['parent_adcode', resolvedPlace.boundary.parentAdcode ?? resolvedPlace.place.adcode],
  ];
  entries.forEach(([key, value], index) => { metadata.getCell(index + 1, 1).value = key; metadata.getCell(index + 1, 2).value = value; });
  metadata.getCell('A8').value = 'adcode';
  metadata.getCell('B8').value = 'name';
  resolvedPlace.regions.forEach((region, index) => {
    metadata.getCell(index + 9, 1).value = region.adcode;
    metadata.getCell(index + 9, 2).value = region.name;
  });
  metadata.state = 'veryHidden';
  await mkdir(path.dirname(target), { recursive: true });
  await workbook.xlsx.writeFile(target);
  return { outputPath: target, place: resolvedPlace.place, childLevel: resolvedPlace.childLevel, regionCount: resolvedPlace.regions.length, templateVersion: TEMPLATE_VERSION };
}

export const templateWorkbookContract = { version: TEMPLATE_VERSION, sheetName: SHEET_NAME, metadataSheet: METADATA_SHEET };

