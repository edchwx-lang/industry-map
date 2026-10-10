import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, posix, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as echarts from 'echarts';
import { placeScreenLabels } from './screen-labels.mjs';

const findBrowser = createBrowserResolver();

/** Export an ECharts option using local SVG rendering and a locally installed browser. */
export async function exportArtifacts({ option, geojson, lineOverlay, outputDir, slug, width = 3840, height = 2160, force = false }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('width and height must be positive integers');
  await mkdir(outputDir, { recursive: true });
  const targets = { svg: join(outputDir, `${slug}.svg`), png: join(outputDir, `${slug}.png`), pdf: join(outputDir, `${slug}.pdf`) };
  if (!force) await rejectExisting(Object.values(targets));
  const { svg, diagnostics } = renderSvg(option, geojson, width, height, lineOverlay);
  const temporarySvg = `${targets.svg}.tmp-${process.pid}-${Date.now()}.svg`;
  const temporaryPng = `${targets.png}.tmp-${process.pid}-${Date.now()}.png`;
  const temporaryPdf = `${targets.pdf}.tmp-${process.pid}-${Date.now()}.pdf`;
  const temporaryPrintDocument = `${targets.pdf}.tmp-${process.pid}-${Date.now()}.html`;
  await writeFile(temporarySvg, svg, 'utf8');
  await writeFile(temporaryPrintDocument, printDocument(svg, width, height), 'utf8');
  try {
    const browser = await findBrowser();
    const profile = await mkdtemp(join(tmpdir(), 'industry-map-browser-'));
    const browserArgs = buildBrowserArguments(profile);
    try {
      await runBrowser(browser, [...browserArgs, '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`, `--screenshot=${temporaryPng}`, toFileUrl(temporarySvg)]);
      await runBrowser(browser, [...browserArgs, '--no-pdf-header-footer', `--print-to-pdf=${temporaryPdf}`, toFileUrl(temporaryPrintDocument)]);
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error => {
        process.stderr.write(`Browser profile cleanup warning: ${error.message}\n`);
      });
      await removeIfPresent(temporaryPrintDocument);
    }
    await assertNonempty(temporaryPng);
    await assertNonempty(temporaryPdf);
    await rename(temporarySvg, targets.svg);
    await rename(temporaryPng, targets.png);
    await rename(temporaryPdf, targets.pdf);
    return { ...targets, width, height, browser, echarts: echarts.version, diagnostics };
  } catch (error) {
    await Promise.all([temporarySvg, temporaryPng, temporaryPdf, temporaryPrintDocument].map(path => removeIfPresent(path)));
    throw error;
  }
}

export function buildBrowserArguments(profile) {
  if (typeof profile !== 'string' || !profile) throw new Error('Browser rendering requires an isolated user-data directory');
  return [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--metrics-recording-only',
    `--user-data-dir=${profile}`,
  ];
}

function printDocument(svg, width, height) {
  const landscape = width >= height;
  const pageWidth = landscape ? 16 : 16 * width / height;
  const pageHeight = landscape ? 16 * height / width : 16;
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${pageWidth}in ${pageHeight}in;margin:0}html,body{width:100%;height:100%;margin:0;overflow:hidden}svg{display:block;width:100%!important;height:100%!important}</style></head><body>${svg}</body></html>`;
}

export function renderSvg(option, geojson, width, height, lineOverlay) {
  echarts.registerMap('industry-map', normalizeGeojsonForEcharts(geojson, option.geo?.nameProperty ?? 'name'));
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height });
  try {
    chart.setOption(option);
    const geo = chart.getModel().getComponent('geo').coordinateSystem;
    const [a,b,c,d] = geo.transform;
    const scaleX = Math.hypot(a,b), scaleY = Math.hypot(c,d);
    if (geo.projection && (!Number.isFinite(scaleX / scaleY) || Math.abs(scaleX / scaleY - 1) > 1e-9)) throw new Error('Export refused: anisotropic screen transform; 地图必须等比例缩放');
    const graphics=[];
    for (const feature of lineOverlay?.features ?? []) {
      const geometry=feature.geometry;
      const segments=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:null;
      if(!segments) throw new Error('Line overlay only accepts LineString/MultiLineString');
      for(const segment of segments) {
        if(segment.length<2 || segment.some(p=>p.length<2 || !p.slice(0,2).every(Number.isFinite))) throw new Error('Invalid boundary line coordinates');
        const points=segment.map(p=>geo.dataToPoint(p));
        if(points.some(p=>!p || !p.every(Number.isFinite))) throw new Error('Boundary projection failed');
        graphics.push({type:'polyline',silent:true,z:5,shape:{points},style:{stroke:'#374151',lineWidth:Math.max(1,1.8*Math.min(width/3840,height/2160)),fill:null}});
      }
    }
    if(graphics.length) chart.setOption({graphic:[...(option.graphic??[]),...graphics]});
    const labels=placeScreenLabels(chart,width,height,option.publication?.mapFrame);
    return {svg:chart.renderToSVGString(),diagnostics:{scaleX,scaleY,isotropic:Math.abs(scaleX/scaleY-1)<1e-9,projection:option.geographicMetadata?.name??'legacy',lineSegmentCount:graphics.length,labels}};
  } finally {
    chart.dispose();
  }
}

export function normalizeGeojsonForEcharts(geojson, nameProperty) {
  return {
    ...geojson,
    features: geojson.features.map(feature => ({
      ...feature,
      properties: { ...feature.properties, name: String(feature.properties?.[nameProperty]) },
    })),
  };
}

export function createBrowserResolver(resolveExecutable = resolveBrowserExecutable) {
  let browserExecutablePromise;
  return async function findResolvedBrowser() {
    browserExecutablePromise ??= Promise.resolve().then(() => resolveExecutable());
    try {
      return await browserExecutablePromise;
    } catch (error) {
      browserExecutablePromise = undefined;
      throw error;
    }
  };
}

/** Resolve a browser executable using the filesystem and PATH without launching any candidate. */
export async function resolveBrowserExecutable({ environment = process.env, platform = process.platform, homedirPath = homedir(), statFile = stat, accessFile = access } = {}) {
  const candidates = browserCandidates({ environment, platform, homedirPath });
  for (const candidatePath of candidates) {
    try {
      if (!(await statFile(candidatePath)).isFile()) continue;
      if (platform !== 'win32') await accessFile(candidatePath, fsConstants.X_OK);
      return candidatePath;
    } catch { /* inspect the next filesystem candidate */ }
  }
  throw new Error(`No local Edge, Chrome, or Chromium executable is available on ${platform}; set INDUSTRY_MAP_BROWSER to its executable path`);
}

export function browserCandidates({ environment = process.env, platform = process.platform, homedirPath = homedir() } = {}) {
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error(`Unsupported browser platform: ${platform}`);
  const pathApi = platform === 'win32' ? win32 : posix;
  const pathSeparator = platform === 'win32' ? ';' : ':';
  const pathDirectories = String(environment.PATH ?? '').split(pathSeparator).filter(Boolean);
  const executableExtensions = platform === 'win32'
    ? String(environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const known = platform === 'win32' ? [
    environment['ProgramFiles(x86)'] && win32.join(environment['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    environment.ProgramFiles && win32.join(environment.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    environment.LOCALAPPDATA && win32.join(environment.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    posix.join(homedirPath, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    posix.join(homedirPath, 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    posix.join(homedirPath, 'Applications/Chromium.app/Contents/MacOS/Chromium'),
  ] : [];
  const commands = platform === 'win32'
    ? ['msedge.exe', 'chrome.exe', 'chromium.exe']
    : platform === 'darwin'
      ? ['google-chrome', 'microsoft-edge', 'chromium', 'chromium-browser']
      : ['google-chrome-stable', 'google-chrome', 'microsoft-edge-stable', 'microsoft-edge', 'chromium', 'chromium-browser'];
  const candidates = [environment.INDUSTRY_MAP_BROWSER, ...known, ...commands].filter(Boolean);
  const expanded = candidates.flatMap(candidate => candidate.includes('/') || candidate.includes('\\') || pathApi.isAbsolute(candidate)
    ? [pathApi.resolve(candidate)]
    : pathDirectories.flatMap(directory => executableExtensionsFor(candidate, executableExtensions).map(extension => pathApi.join(directory, `${candidate}${extension}`))));
  return [...new Set(expanded)];
}

function executableExtensionsFor(candidate, extensions) {
  return extname(candidate) ? [''] : extensions;
}

async function rejectExisting(paths) {
  for (const path of paths) {
    try { await access(path); throw new Error(`Output already exists and --force was not supplied: ${path}`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}
async function assertNonempty(path) { if ((await stat(path)).size < 1) throw new Error(`Browser produced an empty artifact: ${path}`); }
async function removeIfPresent(path) { try { const { unlink } = await import('node:fs/promises'); await unlink(path); } catch { /* cleanup only */ } }
export function toFileUrl(path) { return pathToFileURL(path).href; }
export function runBrowser(command, args, { timeoutMs = 60000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Browser timeout must be positive');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', timedOut = false, settled = false, killTimer;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      error ? reject(error) : resolve();
    };
    const diagnostic = message => new Error(`${message}; browser=${command}${stderr ? `\n${stderr.trim()}` : ''}`);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
    const timer = setTimeout(() => {
      timedOut = true;
      // Only terminate the process tree launched by this export, never a user's browser by name.
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 2000 });
        killer.on('error', () => child.kill('SIGKILL'));
      } else child.kill('SIGKILL');
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        child.stderr.destroy();
        child.unref();
        finish(diagnostic(`Browser timed out after ${timeoutMs} ms`));
      }, 3000);
    }, timeoutMs);
    child.once('error', error => finish(diagnostic(`Browser launch failed: ${error.message}`)));
    child.once('close', (code, signal) => finish(timedOut
      ? diagnostic(`Browser timed out after ${timeoutMs} ms`)
      : code === 0 ? undefined : diagnostic(`Browser exited with code ${code}${signal ? ` signal ${signal}` : ''}`)));
  });
}
