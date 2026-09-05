import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createTemplateWorkbook } from '../scripts/lib/template-workbook.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');
const samplePlace = {
  place: { name: '测试市', adcode: '440100', level: 'city', parentAdcode: '440000' },
  childLevel: 'county',
  boundary: { id: 'china-county', sha256: 'a'.repeat(64), parentAdcode: '440100' },
  regions: [
    { name: '甲区', adcode: '440101', parentAdcode: '440100', level: 'county' },
    { name: '乙区', adcode: '440102', parentAdcode: '440100', level: 'county' },
  ],
};

test('creates a protected template with only metadata and metric cells editable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-template-'));
  const outputPath = path.join(root, '测试市产业热力图数据模板.xlsx');
  await createTemplateWorkbook({ resolvedPlace: samplePlace, outputPath });
  assert.equal((await stat(outputPath)).isFile(), true);

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(outputPath);
  const sheet = workbook.getWorksheet('产业地图数据模板');
  const metadata = workbook.getWorksheet('_industry_map_metadata');
  assert.equal(metadata.state, 'veryHidden');
  assert.equal(sheet.sheetProtection.sheet, true);
  assert.equal(sheet.getCell('A7').value, '甲区');
  assert.equal(sheet.getCell('A7').protection?.locked ?? true, true);
  for (const address of ['B2', 'B3', 'B4', 'B7', 'B8']) assert.equal(sheet.getCell(address).protection.locked, false, address);
  assert.equal(sheet.getCell('B7').dataValidation.type, 'decimal');
  assert.equal(sheet.getCell('B7').dataValidation.allowBlank, true);
  assert.equal(metadata.getCell('B1').value, '1.0.0');
  assert.equal(metadata.getCell('B5').value, 'a'.repeat(64));
});

test('template creation refuses invalid extensions and existing targets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-template-'));
  await assert.rejects(createTemplateWorkbook({ resolvedPlace: samplePlace, outputPath: path.join(root, 'bad.xls') }), /\.xlsx/i);
  const outputPath = path.join(root, 'template.xlsx');
  await createTemplateWorkbook({ resolvedPlace: samplePlace, outputPath });
  await assert.rejects(createTemplateWorkbook({ resolvedPlace: samplePlace, outputPath }), /already exists/i);
});

test('template CLI resolves Dongguan and writes its 34 canonical regions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-template-'));
  const outputPath = path.join(root, '东莞市产业热力图数据模板.xlsx');
  const run = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'industry-map.mjs'), 'template', 'create', '--place', '东莞市', '--output', outputPath], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.regionCount, 34);
  assert.equal(result.childLevel, 'town');
});
