import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('packaged V1 creates one protected template and renders both audited map modes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-v1-acceptance-'));
  const packaged = path.join(root, 'industry-map');
  let result = await run(process.execPath, [path.join(skillRoot, 'scripts', 'package-skill.mjs'), '--output', packaged], 120_000);
  assert.equal(result.status, 0, result.stderr);
  const cli = path.join(packaged, 'dist', 'industry-map.mjs');
  result = await run(process.execPath, [cli, 'version']);
  assert.deepEqual(JSON.parse(result.stdout), { name: 'industry-map', version: '1.3.0', release: 'V1' });
  await assert.rejects(stat(path.join(packaged, 'node_modules')), { code: 'ENOENT' });
  assert.ok(await directoryBytes(packaged) < 100 * 1024 * 1024);

  const templatePath = path.join(root, '东莞产业地图模板.xlsx');
  result = await run(process.execPath, [cli, 'template', 'create', '--place', '东莞市', '--output', templatePath]);
  assert.equal(result.status, 0, result.stderr);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.getWorksheet('产业地图数据模板');
  sheet.getCell('B2').value = '东莞市重点企业分布图';
  sheet.getCell('B3').value = '重点企业数量';
  sheet.getCell('B4').value = '家';
  for (let row = 7; row <= 40; row += 1) if (row <= 11) sheet.getCell(row, 2).value = (row - 6) * 10;
  await workbook.xlsx.writeFile(templatePath);

  const reports = [];
  for (const mode of ['choropleth', 'bubble']) {
    const outputDir = path.join(root, mode);
    const configPath = path.join(root, `${mode}.json`);
    await writeFile(configPath, JSON.stringify({
      mode, templatePath, outputDir, slug: `dongguan-${mode}`, width: 800, height: 450,
      paletteId: 'mixed-c', classes: 5,
      classification: { method: 'equal', source: 'user-confirmed', breaks: [0, 10, 20, 30, 40, 50] },
    }));
    result = await run(process.execPath, [cli, 'render', '--config', configPath], 120_000);
    assert.equal(result.status, 0, result.stderr);
    for (const file of [`dongguan-${mode}.png`, `dongguan-${mode}.svg`, `dongguan-${mode}.pdf`, 'data-audit.xlsx', 'map-config.resolved.json', 'render-report.json']) await stat(path.join(outputDir, file));
    const report = JSON.parse(await readFile(path.join(outputDir, 'render-report.json'), 'utf8'));
    reports.push(report);
    assert.equal(report.input.adapterType, 'template');
    assert.equal(report.input.templateVersion, '1.0.0');
    assert.equal(report.input.defaultedZeroCount, 29);
    assert.equal(report.join.matchedCount, 34);
    assert.equal(report.presentation.labels.mode, 'name');
    assert.equal(report.presentation.labels.emittedLabelCount, 34);
    assert.equal(report.presentation.legend.type, mode === 'bubble' ? 'graduated-circles' : 'rectangles');
    assert.equal(report.presentation.legend.title, '重点企业数量（家）');
    assert.equal(report.classification.source, 'user-confirmed');
    assert.equal(report.classification.intervalSemantics, 'left-closed-right-open');
    const audit = XLSX.readFile(path.join(outputDir, 'data-audit.xlsx'));
    const matched = XLSX.utils.sheet_to_json(audit.Sheets.matched);
    assert.equal(matched.filter(row => row.value_provenance === 'defaulted_zero').length, 29);
  }
  assert.deepEqual(reports[0].classification.breaks, reports[1].classification.breaks);
  t.diagnostic(`acceptance artifacts retained at ${root}`);
});

async function directoryBytes(root) {
  let bytes = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    bytes += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return bytes;
}

function run(command, args, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`timeout: ${command}`)); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}
