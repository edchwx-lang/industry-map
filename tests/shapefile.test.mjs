import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readPolygonShapefile } from '../scripts/lib/shapefile.mjs';

function shpRecord(rings) {
  const points = rings.flat();
  const parts = []; let cursor = 0;
  for (const ring of rings) { parts.push(cursor); cursor += ring.length; }
  const body = Buffer.alloc(44 + parts.length * 4 + points.length * 16);
  body.writeInt32LE(5, 0); body.writeDoubleLE(0, 4); body.writeDoubleLE(0, 12);
  body.writeDoubleLE(10, 20); body.writeDoubleLE(10, 28);
  body.writeInt32LE(parts.length, 36); body.writeInt32LE(points.length, 40);
  parts.forEach((value, index) => body.writeInt32LE(value, 44 + index * 4));
  points.forEach(([x, y], index) => { body.writeDoubleLE(x, 44 + parts.length * 4 + index * 16); body.writeDoubleLE(y, 52 + parts.length * 4 + index * 16); });
  return body;
}

function files(records, { deleted = false } = {}) {
  const shpLength = 100 + records.reduce((sum, body) => sum + 8 + body.length, 0);
  const shp = Buffer.alloc(shpLength); shp.writeInt32BE(9994, 0); shp.writeInt32BE(shpLength / 2, 24); shp.writeInt32LE(1000, 28); shp.writeInt32LE(5, 32);
  const shx = Buffer.alloc(100 + records.length * 8); shp.copy(shx, 0, 0, 100); shx.writeInt32BE(shx.length / 2, 24);
  let offset = 100;
  records.forEach((body, index) => { shp.writeInt32BE(index + 1, offset); shp.writeInt32BE(body.length / 2, offset + 4); body.copy(shp, offset + 8); shx.writeInt32BE(offset / 2, 100 + index * 8); shx.writeInt32BE(body.length / 2, 104 + index * 8); offset += body.length + 8; });
  const fields = [{ name: 'county', len: 20 }, { name: 'co_code', len: 12 }];
  const headerLength = 32 + fields.length * 32 + 1; const recordLength = 1 + fields.reduce((n, f) => n + f.len, 0);
  const dbf = Buffer.alloc(headerLength + records.length * recordLength + 1, 0x20); dbf[0] = 3; dbf.writeUInt32LE(records.length, 4); dbf.writeUInt16LE(headerLength, 8); dbf.writeUInt16LE(recordLength, 10);
  fields.forEach((field, index) => { const at = 32 + index * 32; dbf.write(field.name, at, 'ascii'); dbf[at + 11] = 67; dbf[at + 16] = field.len; }); dbf[headerLength - 1] = 0x0d;
  records.forEach((_, index) => { const at = headerLength + index * recordLength; dbf[at] = deleted && index === 0 ? 0x2a : 0x20; dbf.write('Test', at + 1, 'ascii'); dbf.write('440300440307', at + 21, 'ascii'); }); dbf[dbf.length - 1] = 0x1a;
  return { shp, shx, dbf };
}

async function fixture(payload) { const root = await mkdtemp(path.join(os.tmpdir(), 'shape-test-')); for (const [ext, bytes] of Object.entries(payload)) await writeFile(path.join(root, `x.${ext}`), bytes); return root; }

test('polygon parser assigns a contained ring as a hole without dropping coordinates', async () => {
  const outer = [[0,0],[10,0],[10,10],[0,10],[0,0]];
  const hole = [[2,2],[2,4],[4,4],[4,2],[2,2]];
  const root = await fixture(files([shpRecord([outer, hole])]));
  const result = await readPolygonShapefile({ shpPath: path.join(root,'x.shp'), shxPath: path.join(root,'x.shx'), dbfPath: path.join(root,'x.dbf'), encoding: 'gb18030' });
  assert.deepEqual(result.features[0].geometry.coordinates, [outer, hole]);
  assert.equal(result.features[0].properties.co_code, '440300440307');
});

test('polygon parser blocks deleted DBF records', async () => {
  const ring = [[0,0],[1,0],[1,1],[0,0]];
  const root = await fixture(files([shpRecord([ring])], { deleted: true }));
  await assert.rejects(readPolygonShapefile({ shpPath:path.join(root,'x.shp'), shxPath:path.join(root,'x.shx'), dbfPath:path.join(root,'x.dbf') }), /deleted DBF record/i);
});

test('polygon parser blocks SHX and SHP misalignment', async () => {
  const payload = files([shpRecord([[[0,0],[1,0],[1,1],[0,0]]])]); payload.shx.writeInt32BE(999, 100);
  const root = await fixture(payload);
  await assert.rejects(readPolygonShapefile({ shpPath:path.join(root,'x.shp'), shxPath:path.join(root,'x.shx'), dbfPath:path.join(root,'x.dbf') }), /alignment/i);
});
