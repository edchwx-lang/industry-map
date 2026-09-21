import { readFile } from 'node:fs/promises';

function header(buffer, label) {
  if (buffer.length < 100 || buffer.readInt32BE(0) !== 9994 || buffer.readInt32LE(28) !== 1000) throw new Error(`invalid ${label} header`);
  if (buffer.readInt32BE(24) * 2 !== buffer.length) throw new Error(`${label} length does not match header`);
  if (buffer.readInt32LE(32) !== 5) throw new Error(`${label} must contain Polygon shapes`);
}

function parseDbf(buffer, encoding) {
  if (buffer.length < 33) throw new Error('invalid DBF header');
  const count = buffer.readUInt32LE(4), headerLength = buffer.readUInt16LE(8), recordLength = buffer.readUInt16LE(10);
  if (headerLength < 33 || recordLength < 2 || headerLength + count * recordLength > buffer.length) throw new Error('invalid DBF dimensions');
  const decoder = new TextDecoder(encoding, { fatal: true }); const fields = [];
  for (let at = 32; at + 32 <= headerLength && buffer[at] !== 0x0d; at += 32) {
    const end = buffer.indexOf(0, at); const name = buffer.subarray(at, end < 0 || end > at + 11 ? at + 11 : end).toString('ascii').trim();
    const length = buffer[at + 16]; if (!name || !length) throw new Error('invalid DBF field descriptor'); fields.push({ name, length });
  }
  if (1 + fields.reduce((n, f) => n + f.length, 0) !== recordLength) throw new Error('DBF field lengths do not match record length');
  const rows = [];
  for (let index = 0; index < count; index++) {
    let at = headerLength + index * recordLength; if (buffer[at] === 0x2a) throw new Error(`deleted DBF record ${index + 1}`); if (buffer[at] !== 0x20) throw new Error(`invalid DBF record ${index + 1}`); at++;
    const row = {}; for (const field of fields) { row[field.name] = decoder.decode(buffer.subarray(at, at + field.length)).replace(/[\0 ]+$/g, '').trimStart(); at += field.length; } rows.push(row);
  }
  return rows;
}

const pointInRing = ([x, y], ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi,yi]=ring[i], [xj,yj]=ring[j]; if (((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside; } return inside; };
const area = (ring) => Math.abs(ring.slice(1).reduce((sum,[x,y],i) => sum + ring[i][0]*y-x*ring[i][1],0)/2);

function polygon(body, recordNumber) {
  if (body.length < 44 || body.readInt32LE(0) !== 5) throw new Error(`record ${recordNumber} is not Polygon`);
  const partCount=body.readInt32LE(36), pointCount=body.readInt32LE(40), pointsAt=44+partCount*4;
  if (partCount < 1 || pointCount < 4 || pointsAt + pointCount*16 !== body.length) throw new Error(`invalid Polygon record ${recordNumber}`);
  const starts = Array.from({length:partCount},(_,i)=>body.readInt32LE(44+i*4)); starts.push(pointCount);
  if (starts[0] !== 0 || starts.some((v,i)=>i && v<=starts[i-1])) throw new Error(`invalid part indexes in record ${recordNumber}`);
  const rings = starts.slice(0,-1).map((start,i)=>Array.from({length:starts[i+1]-start},(_,j)=>{ const at=pointsAt+(start+j)*16; const p=[body.readDoubleLE(at),body.readDoubleLE(at+8)]; if (!p.every(Number.isFinite)) throw new Error(`non-finite coordinate in record ${recordNumber}`); return p; }));
  for (const ring of rings) if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error(`unclosed ring in record ${recordNumber}`);
  const info=rings.map((ring,index)=>({ring,index,area:area(ring),containers:[]}));
  for (const item of info) item.containers=info.filter(other=>other!==item && other.area>item.area && pointInRing(item.ring[0],other.ring)).sort((a,b)=>a.area-b.area);
  const shells=info.filter(item=>item.containers.length%2===0); const polygons=shells.map(shell=>[shell.ring]);
  for (const hole of info.filter(item=>item.containers.length%2===1)) { const shell=hole.containers.find(candidate=>candidate.containers.length%2===0); if (!shell) throw new Error(`orphan hole in record ${recordNumber}`); polygons[shells.indexOf(shell)].push(hole.ring); }
  return polygons.length===1 ? {type:'Polygon',coordinates:polygons[0]} : {type:'MultiPolygon',coordinates:polygons};
}

export async function readPolygonShapefile({ shpPath, shxPath, dbfPath, encoding='gb18030' }) {
  const [shp,shx,dbf]=await Promise.all([readFile(shpPath),readFile(shxPath),readFile(dbfPath)]); header(shp,'SHP'); header(shx,'SHX');
  if ((shx.length-100)%8) throw new Error('invalid SHX record table'); const count=(shx.length-100)/8, rows=parseDbf(dbf,encoding); if (rows.length!==count) throw new Error('SHP/SHX/DBF record count mismatch');
  const features=[];
  for(let i=0;i<count;i++){ const offset=shx.readInt32BE(100+i*8)*2, length=shx.readInt32BE(104+i*8)*2; if(offset<100||offset+8+length>shp.length||shp.readInt32BE(offset)!==i+1||shp.readInt32BE(offset+4)*2!==length) throw new Error(`SHP/SHX record alignment mismatch at record ${i+1}`); features.push({type:'Feature',properties:rows[i],geometry:polygon(shp.subarray(offset+8,offset+8+length),i+1)}); }
  return {type:'FeatureCollection',features};
}
