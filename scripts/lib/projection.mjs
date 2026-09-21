import { geoConicEqualArea, geoEquirectangular, geoMercator } from 'd3-geo';

const TAIWAN = new Set(['Taiwan', 'Taiwan Province', 'Taiwan, Province of China', '台湾', '台湾省', '臺灣', '臺灣省']);
const CHINA = new Set(['China', '中国', '中华人民共和国', "People's Republic of China"]);
export function isTaiwan(feature, geoKey = {}) {
  const p=feature.properties ?? {};
  return [p[geoKey.name ?? 'name'],p.name].some(n=>TAIWAN.has(n)) || [p[geoKey.code],p.adcode,p.iso_a3].some(code=>['710000','710000000000','TW','TWN'].includes(String(code ?? '')));
}
export function inferMapScope(config, features) {
  if (config.mapScope && !['world','china-province','regional'].includes(config.mapScope)) throw new Error('mapScope must be world, china-province or regional');
  const names=features.map(f=>f.properties?.[config.geoKey?.name ?? 'name']);
  const looksWorld=features.some(f=>f.properties?.level==='country') || names.some(n=>CHINA.has(n));
  if (looksWorld) {
    if(config.mapScope && config.mapScope!=='world') throw new Error('Country features conflict with mapScope');
    return 'world';
  }
  if(config.mapScope) return config.mapScope;
  if(features.some(f=>f.properties?.level==='province' || String(f.properties?.adcode)==='710000')) return 'china-province';
  return 'regional';
}
export function geographicPresentation(config, joined) {
  const features=[...joined.matchedFeatures.map(r=>r.feature),...joined.unmatchedFeatures];
  const scope=inferMapScope(config,features);
  if(scope==='world' && features.some(f=>isTaiwan(f,config.geoKey))) throw new Error('World China/Taiwan geometry requires explicit regionGroups aggregation; do not render Taiwan independently');
  const requested=config.projection?.name;
  const name=requested ?? (scope==='china-province'?'china-albers':scope==='world'?'equirectangular':'mercator');
  let projection;
  if(name==='china-albers') projection=geoConicEqualArea().parallels([25,47]).rotate([-105,0]).center([0,35]);
  else if(name==='equirectangular') projection=geoEquirectangular();
  else if(name==='mercator') projection=geoMercator();
  else throw new Error(`Unsupported projection: ${name}`);
  projection.scale(1).translate([0,0]);
  return {scope, name, projection:{project:point=>projection(point),unproject:point=>projection.invert(point)},metadata:{scope,name,parameters:name==='china-albers'?{parallels:[25,47],centralMeridian:105,latitudeOfOrigin:35}:{},fit:'contain',screenScale:'isotropic'}};
}
