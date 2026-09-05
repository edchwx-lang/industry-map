import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import XLSX from 'xlsx';
import { resolveAgentSkillRoot } from '../scripts/install-skill.mjs';

const skillRoot = path.resolve(import.meta.dirname, '..');

test('installer resolves Codex, Claude Code, and WorkBuddy skill roots portably', () => {
  assert.equal(resolveAgentSkillRoot({ agent: 'codex', homedirPath: '/Users/mei', environment: {} }), '/Users/mei/.codex/skills');
  assert.equal(resolveAgentSkillRoot({ agent: 'claude', homedirPath: '/Users/mei', environment: {} }), '/Users/mei/.claude/skills');
  assert.equal(resolveAgentSkillRoot({ agent: 'workbuddy', homedirPath: '/Users/mei', environment: {} }), '/Users/mei/.workbuddy/skills');
  assert.equal(resolveAgentSkillRoot({ agent: 'claude', homedirPath: '/Users/mei', environment: { CLAUDE_SKILLS_DIR: '/opt/claude-skills' } }), '/opt/claude-skills');
  assert.throws(() => resolveAgentSkillRoot({ agent: 'unknown', homedirPath: '/Users/mei', environment: {} }), /supported agents/i);
});

test('multi-agent packager emits three standalone packages and a WorkBuddy zip', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-agents-'));
  const run = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'package-agents.mjs'), '--output', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  for (const agent of ['codex', 'claude', 'workbuddy']) {
    assert.equal((await stat(path.join(root, agent, 'industry-map', 'SKILL.md'))).isFile(), true);
    assert.equal((await stat(path.join(root, agent, 'industry-map', 'dist', 'industry-map.mjs'))).isFile(), true);
  }
  const { version } = JSON.parse(await readFile(path.join(skillRoot, 'package.json'), 'utf8'));
  const zip = await readFile(path.join(root, `industry-map-workbuddy-v${version}.zip`));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
});

test('packaged documentation defines the V1.2 gate, classification, and migration contract', async () => {
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const input = await readFile(path.join(skillRoot, 'references', 'input-contract.md'), 'utf8');
  const style = await readFile(path.join(skillRoot, 'references', 'style-spec.md'), 'utf8');
  assert.match(skill, /默认.*只显示.*行政区.*名称/);
  assert.match(input, /labels\.showValues.*true/);
  assert.match(input, /未匹配.*只显示.*名称/);
  assert.match(style, /矩形.*图例/);
  assert.match(style, /分级圆.*图例/);
  assert.match(skill, /图表类型.*颜色.*分级/s);
  assert.match(skill, /一次性.*询问|一次.*询问/);
  assert.match(input, /classification\.source/);
  assert.match(input, /user-confirmed/);
  assert.match(style, /左闭右开/);
  assert.match(style, /thresholds/);
  assert.match(style, /blue-a.*orange-a.*mixed-c/s);
  assert.match(input, /V1\.2.*迁移/);
});

test('V1.3 documentation defines cross-agent installation and macOS browser/cache behavior', async () => {
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const compatibility = await readFile(path.join(skillRoot, 'references', 'compatibility.md'), 'utf8');
  assert.match(skill, /Codex.*Claude Code.*WorkBuddy/s);
  assert.match(compatibility, /Node\.js 22/);
  assert.match(compatibility, /\.claude\/skills\/industry-map/);
  assert.match(compatibility, /\.workbuddy\/skills\/industry-map/);
  assert.match(compatibility, /Library\/Caches\/industry-map/);
  assert.match(compatibility, /INDUSTRY_MAP_BROWSER/);
});

async function directoryBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    total += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return total;
}

test('production package runs without node_modules and stays below 100 MiB', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'industry-map-package-'));
  const packaged = path.join(root, 'industry-map');
  const build = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'package-skill.mjs'), '--output', packaged], { encoding: 'utf8' });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  assert.equal((await stat(path.join(packaged, 'dist', 'industry-map.mjs'))).isFile(), true);
  await assert.rejects(stat(path.join(packaged, 'node_modules')), { code: 'ENOENT' });
  await assert.rejects(stat(path.join(packaged, 'tests')), { code: 'ENOENT' });
  await assert.rejects(stat(path.join(packaged, 'scripts')), { code: 'ENOENT' });
  assert.ok(await directoryBytes(packaged) < 100 * 1024 * 1024);

  const listed = spawnSync(process.execPath, [path.join(packaged, 'dist', 'industry-map.mjs'), 'boundary', 'list'], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).length, 7);

  const geojsonPath = path.join(root, 'input.geojson');
  const excelPath = path.join(root, 'metrics.xlsx');
  await writeFile(geojsonPath, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '甲' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } }] }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['地区', '企业数'], ['甲', 1]]), '指标');
  XLSX.writeFile(workbook, excelPath);
  const inspected = spawnSync(process.execPath, [path.join(packaged, 'dist', 'industry-map.mjs'), 'inspect', '--geojson', geojsonPath, '--excel', excelPath], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).geojson.featureCount, 1);
});

test('standalone bundle contains no literal trailing whitespace', async () => {
  const bundle = await import('node:fs/promises').then(({ readFile }) => readFile(path.join(skillRoot, 'dist', 'industry-map.mjs'), 'utf8'));
  assert.equal(bundle.split(/\r?\n/).some((line) => /[ \t]+$/.test(line)), false);
});
