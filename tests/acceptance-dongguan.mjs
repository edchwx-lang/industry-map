import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import XLSX from 'xlsx';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(skillRoot, 'dist', 'industry-map.mjs');
const geojsonPath = join(skillRoot, 'boundary', 'china', 'town', 'builtin', '441900.geojson');
const excelPath = 'C:\\Users\\edchw\\Desktop\\geojson\\东莞重点企业数量.xlsx';
const expectedArtifacts = slug => [
  `${slug}.png`,
  `${slug}.svg`,
  `${slug}.pdf`,
  'data-audit.xlsx',
  'map-config.resolved.json',
  'render-report.json',
];

test('packaged skill exposes the discoverable entrypoint, routed contracts, and automatic UI metadata', async () => {
  await Promise.all([
    stat(join(skillRoot, 'SKILL.md')),
    stat(join(skillRoot, 'references', 'input-contract.md')),
    stat(join(skillRoot, 'references', 'style-spec.md')),
  ]);
  const metadata = await readFile(join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
  assert.match(metadata, /display_name:\s*["]产业地图["]/);
  assert.match(metadata, /allow_implicit_invocation:\s*true/);
  assert.match(metadata, /default_prompt:\s*["][^"\r\n]*\$industry-map[^"\r\n]*["]/);
});

test('Dongguan external fixtures render both explicit 4K modes with complete strict-join audits', async t => {
  const inputHashes = await Promise.all([sha256(geojsonPath), sha256(excelPath)]);
  const geojson = JSON.parse(await readFile(geojsonPath, 'utf8'));
  const displayOverrides = new Map([
    ['松山湖管委会', '松山湖'], ['东城街道办事处', '东城街道'],
    ['南城街道办事处', '南城街道'], ['万江街道办事处', '万江街道'],
  ]);
  const expectedDisplayNames = geojson.features.map(feature => displayOverrides.get(feature.properties.name) ?? feature.properties.name);
  const inspectResult = await runProcess(process.execPath, [cliPath, 'inspect', '--geojson', geojsonPath, '--excel', excelPath]);
  assert.equal(inspectResult.status, 0, inspectResult.stderr);
  const inspection = JSON.parse(inspectResult.stdout);
  assert.equal(inspection.geojson.featureCount, 34);
  const selected = inspection.workbook.tables.find(candidate => candidate.sheet === '各乡镇企业情况概览' && candidate.headerRow === 4);
  assert.ok(selected, 'expected the 32-row township table to be discovered');
  assert.equal(selected.rowCount, 32);
  assert.deepEqual(selected.metricCandidates.map(candidate => candidate.key), ['企业总数']);

  const acceptanceRoot = await mkdtemp(join(tmpdir(), 'industry-map-dongguan-'));
  t.diagnostic(`4K acceptance artifacts retained at ${acceptanceRoot}`);
  const reports = [];
  for (const mode of ['choropleth', 'bubble']) {
    const slug = `dongguan-${mode}`;
    const outputDir = join(acceptanceRoot, mode);
    const configPath = join(acceptanceRoot, `${mode}.resolved.json`);
    const config = {
      mode,
      geojsonPath,
      excelPath,
      outputDir,
      slug,
      width: 3840,
      height: 2160,
      sheet: '各乡镇企业情况概览',
      headerRow: 4,
      dataRange: { startRow: 5, endRow: 36 },
      geoKey: { code: 'adcode', name: 'name' },
      rowKey: { name: '乡镇街道' },
      metricKey: '企业总数',
      aliases: [
        { excel: '松山湖', geo: '松山湖管委会', display: '松山湖' },
        { excel: '东城街道', geo: '东城街道办事处', display: '东城街道' },
        { excel: '南城街道', geo: '南城街道办事处', display: '南城街道' },
        { excel: '万江街道', geo: '万江街道办事处', display: '万江街道' },
      ],
      title: mode === 'choropleth' ? '东莞重点企业分布图' : '东莞重点企业气泡图',
      unit: '家',
      paletteId: 'blue-a',
      classes: 5,
      classification: { method: 'auto', source: 'user-confirmed' },
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    const renderResult = await runProcess(process.execPath, [cliPath, 'render', '--config', configPath], 120_000);
    assert.equal(renderResult.status, 0, renderResult.stderr);

    await Promise.all(expectedArtifacts(slug).map(file => stat(join(outputDir, file))));
    const png = await readFile(join(outputDir, `${slug}.png`));
    assert.equal(png.readUInt32BE(16), 3840);
    assert.equal(png.readUInt32BE(20), 2160);
    const svg = await readFile(join(outputDir, `${slug}.svg`), 'utf8');
    assert.match(svg, /<text|<path/i);
    for (const name of expectedDisplayNames) assert.ok(svg.includes(name), `expected ${name} in ${mode} SVG`);
    assert.doesNotMatch(svg, /<text[^>]*fill-opacity="0"[^>]*>[^<]*(?:镇|街道|园|管委会)/);
    const pdf = await readFile(join(outputDir, `${slug}.pdf`));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const pdfSource = pdf.toString('latin1');
    assert.equal([...pdfSource.matchAll(/\/Type\s*\/Page\b/g)].length, 1);
    const mediaBox = pdfSource.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert.ok(mediaBox, 'expected a PDF MediaBox');
    assert.ok(Math.abs(Number(mediaBox[1]) / Number(mediaBox[2]) - 16 / 9) < 0.01);

    const report = JSON.parse(await readFile(join(outputDir, 'render-report.json'), 'utf8'));
    reports.push(report);
    assert.equal(report.join.featureCount, 34);
    assert.equal(report.join.rowCount, 32);
    assert.equal(report.join.matchedCount, 32);
    assert.equal(report.join.unmatchedRowCount, 0);
    assert.equal(report.join.unmatchedFeatureCount, 2);
    assert.equal(report.join.coverage, 32 / 34);
    assert.equal(report.artifacts.png.width, 3840);
    assert.equal(report.artifacts.png.height, 2160);
    assert.equal(report.presentation.labels.mode, 'name');
    assert.equal(report.presentation.labels.emittedLabelCount, 34);
    assert.equal(report.presentation.legend.type, mode === 'bubble' ? 'graduated-circles' : 'rectangles');
    assert.equal(report.presentation.legend.title, '企业总数（家）');
    assert.equal(report.presentation.legend.intervals.length, 5);

    const resolvedConfig = JSON.parse(await readFile(join(outputDir, 'map-config.resolved.json'), 'utf8'));
    assert.equal(resolvedConfig.mode, mode);
    assert.equal(resolvedConfig.aliases.length, 4);
    const audit = XLSX.readFile(join(outputDir, 'data-audit.xlsx'));
    assert.deepEqual(audit.SheetNames, ['summary', 'matched', 'unmatched', 'duplicates', 'aliases']);
    const matched = XLSX.utils.sheet_to_json(audit.Sheets.matched);
    assert.equal(matched.length, 32);
    assert.equal(matched.reduce((sum, row) => sum + row.value, 0), 558);
    const songshan = matched.find(row => row.geo_name === '松山湖管委会');
    assert.ok(songshan, 'expected the explicit alias to match 松山湖管委会');
    assert.equal(songshan.display_name, '松山湖');
    assert.equal(songshan.value, 31);
    assert.equal(XLSX.utils.sheet_to_json(audit.Sheets.aliases).length, 4);
  }
  assert.deepEqual(reports[0].classification.breaks, reports[1].classification.breaks);

  const valueOutputDir = join(acceptanceRoot, 'name-value');
  const valueConfigPath = join(acceptanceRoot, 'name-value.resolved.json');
  await writeFile(valueConfigPath, `${JSON.stringify({
    mode: 'choropleth', geojsonPath, excelPath, outputDir: valueOutputDir, slug: 'dongguan-name-value',
    width: 800, height: 450, sheet: '各乡镇企业情况概览', headerRow: 4,
    dataRange: { startRow: 5, endRow: 36 }, geoKey: { code: 'adcode', name: 'name' },
    rowKey: { name: '乡镇街道' }, metricKey: '企业总数', title: '东莞重点企业分布图', unit: '家',
    paletteId: 'blue-a', classes: 5, classification: { method: 'auto', source: 'user-confirmed' }, labels: { showValues: true },
    aliases: [
      { excel: '松山湖', geo: '松山湖管委会', display: '松山湖' },
      { excel: '东城街道', geo: '东城街道办事处', display: '东城街道' },
      { excel: '南城街道', geo: '南城街道办事处', display: '南城街道' },
      { excel: '万江街道', geo: '万江街道办事处', display: '万江街道' },
    ],
  }, null, 2)}\n`, 'utf8');
  const valueResult = await runProcess(process.execPath, [cliPath, 'render', '--config', valueConfigPath], 120_000);
  assert.equal(valueResult.status, 0, valueResult.stderr);
  const valueReport = JSON.parse(await readFile(join(valueOutputDir, 'render-report.json'), 'utf8'));
  assert.equal(valueReport.presentation.labels.mode, 'name-value');
  assert.equal(valueReport.presentation.labels.emittedLabelCount, 34);
  const valueSvg = await readFile(join(valueOutputDir, 'dongguan-name-value.svg'), 'utf8');
  assert.match(valueSvg, />\d+ 家<\/text>/);
  assert.ok(valueSvg.includes('莞城街道办事处'));
  assert.ok(valueSvg.includes('东莞生态园'));
  assert.deepEqual(await Promise.all([sha256(geojsonPath), sha256(excelPath)]), inputHashes);
});

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function runProcess(command, argumentsList, timeout = 30_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, { windowsHide: true, cwd: skillRoot });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`Process did not finish within ${timeout}ms: ${command}`));
    }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); rejectPromise(error); });
    child.once('close', status => {
      clearTimeout(timer);
      resolvePromise({ status, stdout, stderr });
    });
  });
}
