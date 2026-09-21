import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sameFileTarget } from './same-file-target.mjs';
import { readPolygonShapefile } from './shapefile.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const NAMES = new Set(['宝安区','大鹏新区','福田区','光明区','龙岗区','龙华区','罗湖区','南山区','坪山区','盐田区']);

export async function importShenzhen({ sourceBase, outputPath }) {
  const paths=Object.fromEntries(['shp','shx','dbf','cpg','prj','qmd'].map(ext=>[ext,`${sourceBase}.${ext}`]));
  if (await sameFileTarget(outputPath, Object.values(paths))) throw new Error('output aliases a source file');
  const bytes=Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([ext,p])=>[ext,await readFile(p)])));
  const encoding=bytes.cpg.toString('ascii').trim().toLowerCase(); if (!['gb18030','gbk','cp936'].includes(encoding)) throw new Error(`unsupported CPG encoding: ${encoding}`);
  const prj=bytes.prj.toString('utf8'); if (/PROJCS\s*\[/i.test(prj) || !/GEOGCS\s*\[/i.test(prj) || !/CGCS2000/i.test(prj) || !/UNIT\s*\[\s*["']degree["']/i.test(prj)) throw new Error('PRJ must describe CGCS2000 geographic coordinates in degrees');
  const source=await readPolygonShapefile({shpPath:paths.shp,shxPath:paths.shx,dbfPath:paths.dbf,encoding:'gb18030'});
  const features=source.features.map(({properties,geometry},index)=>{ const city=properties.city?.trim(), name=properties.county?.trim(), adcode=properties.co_code?.trim(); if(city!=='深圳市'||!NAMES.has(name)||!/^\d{12}$/.test(adcode)) throw new Error(`missing or invalid city/county/co_code at record ${index+1}`); return {type:'Feature',properties:{name,adcode,parent_adcode:'440300',level:'county'},geometry}; });
  if(features.length!==10) throw new Error(`expected 10 Shenzhen records, got ${features.length}`); if(new Set(features.map(f=>f.properties.adcode)).size!==features.length || new Set(features.map(f=>f.properties.name)).size!==features.length) throw new Error('duplicate Shenzhen name or adcode');
  const collection={type:'FeatureCollection',features}; const output=Buffer.from(`${JSON.stringify(collection)}\n`); await mkdir(path.dirname(outputPath),{recursive:true});
  try { await writeFile(outputPath,output,{flag:'wx'}); } catch(error) { if(error?.code==='EEXIST') throw new Error(`output already exists: ${outputPath}`); throw error; }
  return {sha256:hash(output),bytes:output.length,featureCount:features.length,geometryTypes:[...new Set(features.map(f=>f.geometry.type))].sort(),sourceSha256:Object.fromEntries(Object.entries(bytes).map(([ext,b])=>[ext,hash(b)]))};
}
