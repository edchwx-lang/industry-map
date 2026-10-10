import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { resolvePlaceChildren } from '../scripts/lib/place-resolver.mjs';
import { createTemplateWorkbook } from '../scripts/lib/template-workbook.mjs';
import { loadTemplateInput } from '../scripts/lib/template-input.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('Shenzhen county template reloads its parent-scoped boundary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-shenzhen-template-'));
  const excelPath = path.join(root, 'shenzhen.xlsx');
  const resolvedPlace = await resolvePlaceChildren({ skillRoot, place: '深圳市' });
  await createTemplateWorkbook({ resolvedPlace, outputPath: excelPath });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.getWorksheet('产业地图数据模板');
  sheet.getCell('B2').value = '深圳产业图';
  sheet.getCell('B3').value = '企业数量';
  sheet.getCell('B7').value = 25;
  await workbook.xlsx.writeFile(excelPath);
  const input = await loadTemplateInput({ excelPath, skillRoot });
  assert.equal(input.boundary.id, 'county-440300');
  assert.equal(input.boundary.parentAdcode, '440300');
  assert.equal(input.rows.length, 10);
  assert.equal(input.rows[0].value, 25);
  assert.equal(input.defaultedZeroCount, 9);
  workbook.getWorksheet('_industry_map_metadata').getCell('B5').value = '0'.repeat(64);
  await workbook.xlsx.writeFile(excelPath);
  await assert.rejects(loadTemplateInput({ excelPath, skillRoot }), /boundary hash/i);
});

async function dongguanTemplate(values = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-template-input-'));
  const excelPath = path.join(root, 'template.xlsx');
  const resolvedPlace = await resolvePlaceChildren({ skillRoot, place: '东莞市' });
  await createTemplateWorkbook({ resolvedPlace, outputPath: excelPath });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.getWorksheet('产业地图数据模板');
  sheet.getCell('B2').value = values.title ?? '东莞产业图';
  sheet.getCell('B3').value = values.metricName ?? '企业数';
  sheet.getCell('B4').value = values.unit ?? '家';
  sheet.getCell('B7').value = values.firstValue ?? 12;
  await workbook.xlsx.writeFile(excelPath);
  return { excelPath, workbook };
}

test('template input preserves entered values and defaults only blank template cells to zero', async () => {
  const { excelPath } = await dongguanTemplate();
  const input = await loadTemplateInput({ excelPath, skillRoot });
  assert.equal(input.adapterType, 'template');
  assert.deepEqual(input.presentation, { title: '东莞产业图', metricName: '企业数', unit: '家' });
  assert.equal(input.rows.length, 34);
  assert.deepEqual(input.rows.slice(0, 2).map(({ value, valueProvenance }) => ({ value, valueProvenance })), [
    { value: 12, valueProvenance: 'entered' },
    { value: 0, valueProvenance: 'defaulted_zero' },
  ]);
  assert.equal(input.defaultedZeroCount, 33);
});

test('template input requires title and metric name but permits an empty unit', async () => {
  const { excelPath } = await dongguanTemplate({ title: '', metricName: '', unit: '' });
  await assert.rejects(loadTemplateInput({ excelPath, skillRoot }), /title.*metric name/i);
});

test('template input rejects modified region identity and boundary hashes', async () => {
  const first = await dongguanTemplate();
  let workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(first.excelPath);
  workbook.getWorksheet('产业地图数据模板').getCell('A7').value = '被修改地区';
  await workbook.xlsx.writeFile(first.excelPath);
  await assert.rejects(loadTemplateInput({ excelPath: first.excelPath, skillRoot }), /region identity/i);

  const second = await dongguanTemplate();
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(second.excelPath);
  workbook.getWorksheet('_industry_map_metadata').getCell('B5').value = '0'.repeat(64);
  await workbook.xlsx.writeFile(second.excelPath);
  await assert.rejects(loadTemplateInput({ excelPath: second.excelPath, skillRoot }), /boundary hash/i);
});

test('template input rejects non-finite metric text', async () => {
  const { excelPath } = await dongguanTemplate({ firstValue: '十二' });
  await assert.rejects(loadTemplateInput({ excelPath, skillRoot }), /finite number/i);
});

