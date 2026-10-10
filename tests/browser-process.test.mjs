import assert from 'node:assert/strict';
import test from 'node:test';
import * as exporter from '../scripts/lib/export.mjs';

test('browser runner captures a failing process diagnostic', async () => {
  assert.equal(typeof exporter.runBrowser, 'function');
  await assert.rejects(exporter.runBrowser(process.execPath, ['-e', 'console.error("diagnostic-marker");process.exit(7)'], { timeoutMs: 5000 }), /code 7.*diagnostic-marker/s);
});

test('browser runner bounds a stalled process and terminates it', async () => {
  assert.equal(typeof exporter.runBrowser, 'function');
  await assert.rejects(exporter.runBrowser(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 300 }), /timed out.*300/s);
});

test('browser runner permits success and reports spawn failures', async () => {
  assert.equal(typeof exporter.runBrowser, 'function');
  await exporter.runBrowser(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs: 5000 });
  await assert.rejects(exporter.runBrowser('industry-map-missing-browser-141', [], { timeoutMs: 5000 }), /ENOENT/);
});
