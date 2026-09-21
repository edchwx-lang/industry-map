import assert from 'node:assert/strict';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importShenzhen } from '../scripts/import-shenzhen.mjs';

const realBase='C:/Users/edchw/Desktop/AI STUDY/geojson/SZ/深圳区县 gb18030';
async function copiedSource() { const root=await mkdtemp(path.join(os.tmpdir(),'sz-import-')); const base=path.join(root,'source'); for(const ext of ['shp','shx','dbf','cpg','prj','qmd']) await copyFile(`${realBase}.${ext}`,`${base}.${ext}`); return {root,base}; }

test('Shenzhen import refuses to overwrite an existing output', async () => {
  const {root,base}=await copiedSource(); const output=path.join(root,'out.geojson'); await writeFile(output,'keep');
  await assert.rejects(importShenzhen({sourceBase:base,outputPath:output}), /already exists/i);
  assert.equal(await (await import('node:fs/promises')).readFile(output,'utf8'),'keep');
});

test('Shenzhen import rejects a projected or non-CGCS2000 PRJ', async () => {
  const {root,base}=await copiedSource(); await writeFile(`${base}.prj`,'PROJCS["CGCS2000 / fake"]');
  await assert.rejects(importShenzhen({sourceBase:base,outputPath:path.join(root,'out.geojson')}), /CGCS2000 geographic/i);
});
