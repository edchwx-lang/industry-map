import test from 'node:test';
import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import { buildChartOption } from '../scripts/lib/options.mjs';
import { applyRegionGroups } from '../scripts/lib/region-groups.mjs';
import { renderSvg } from '../scripts/lib/export.mjs';

const feature = (name, x, y, code) => ({type:'Feature',properties:{name,adcode:code},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});
const makeJoined = features => ({matchedFeatures:features.map((f,i)=>({feature:f,displayName:f.properties.name,value:10+i*20,row:{name:f.properties.name,value:10+i*20}})),unmatchedFeatures:[]});
const cfg = {mode:'choropleth',title:'test',geoKey:{name:'name',code:'adcode'},paletteId:'mixed-c',classes:5,classification:{method:'equal',source:'user-confirmed'}};
test('world guard respects custom name and code fields',()=>{
  for(const properties of [{NAME:'Taiwan'},{NAME:'island',CODE:'TWN'}]){
    const f=feature('unused',120,23);f.properties=properties;
    assert.throws(()=>buildChartOption({...cfg,mapScope:'world',geoKey:{name:'NAME',code:'CODE'}},makeJoined([f])),/aggregation/);
  }
});
test('national unmatched Taiwan still uses 台湾省',()=>{
  const joined=makeJoined([feature('广东省',113,23)]);joined.unmatchedFeatures=[feature('台湾',120,23,'710000')];
  const built=buildChartOption({...cfg,mapScope:'china-province'},joined);
  assert.ok(built.option.series.at(-1).data.some(d=>d.displayText==='台湾省'));
});
test('aggregation rejects finite inputs whose sum overflows',()=>{
  const features=[feature('China',100,25),feature('Taiwan',120,23)];const joined=makeJoined(features);joined.matchedFeatures.forEach(r=>r.value=1e308);
  assert.throws(()=>applyRegionGroups({features},joined,{...cfg,regionGroups:[{target:'China',members:['China','Taiwan'],valuesAreDisjoint:true}]}),/finite|overflow/);
});

test('V1.4 projected geometry is fitted isotropically at landscape and portrait sizes',()=>{
  const features=[feature('甲',75,20),feature('乙',130,50)];
  for(const [width,height] of [[3840,2160],[1600,1600],[900,1600]]){
    const {option}=buildChartOption({...cfg,width,height,mapScope:'china-province'},makeJoined(features));
    echarts.registerMap('industry-map',{type:'FeatureCollection',features});
    const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width,height});
    try {chart.setOption(option);const geo=chart.getModel().getComponent('geo').coordinateSystem;
      assert.ok(geo.projection,'an explicit geographic projection is required');
      const [a,b,c,d]=geo.transform;
      assert.ok(Math.abs(Math.hypot(a,b)/Math.hypot(c,d)-1)<1e-9,'no anisotropic screen stretching');
      assert.ok(geo.dataToPoint([110,40])[1]<geo.dataToPoint([110,20])[1],'north must be up');
    } finally {chart.dispose();}
  }
});
test('V1.4 labels render opaque dark text without white outlines',()=>{
  const features=[feature('台湾省',120,23,'710000'),feature('广东省',113,23,'440000')];
  const {option}=buildChartOption({...cfg,mapScope:'china-province'},makeJoined(features));
  echarts.registerMap('industry-map',{type:'FeatureCollection',features});
  const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:3840,height:2160});
  try {chart.setOption(option);const svg=chart.renderToSVGString();const label=svg.match(/<text[^>]*>台湾省<\/text>/)?.[0];assert.ok(label);assert.doesNotMatch(label,/stroke="#FFFFFF"|fill-opacity="0\.8"/);assert.match(label,/fill="#161B22"/i);} finally {chart.dispose();}
});
test('world cannot render independent China/Taiwan records without an explicit aggregation decision',()=>{
  const features=[feature('China',100,25),feature('Taiwan',120,23)];
  assert.throws(()=>buildChartOption({...cfg,mapScope:'world'},makeJoined(features)),/China|中国|aggregation/i);
});
test('national provincial Taiwan label and metric remain separate provincial observations',()=>{
  const features=[feature('台湾',120,23,'710000'),feature('广东省',113,23,'440000')];
  const {option}=buildChartOption({...cfg,mapScope:'china-province'},makeJoined(features));
  assert.ok(option.series.at(-1).data.some(d=>d.displayText==='台湾省'));
  assert.equal(option.series[0].data.length,2);
});
test('already-inclusive China aggregate does not sum Taiwan again but retains geometry',()=>{
  const features=[feature('China',100,25),feature('Taiwan',120,23)];const geo={features};const joined=makeJoined(features);
  applyRegionGroups(geo,joined,{...cfg,regionGroups:[{target:'China',members:['China','Taiwan'],aggregation:'target-includes-members'}]});
  assert.equal(joined.matchedFeatures[0].value,10);assert.equal(geo.features[0].geometry.coordinates.length,2);
});
test('scores are not added when combining countries',()=>{
  const features=[feature('China',100,25),feature('Taiwan',120,23)];
  assert.throws(()=>applyRegionGroups({features},makeJoined(features),{...cfg,metricKind:'score',regionGroups:[{target:'China',members:['China','Taiwan'],valuesAreDisjoint:true}]}),/score|评分|additive/i);
});
test('runtime refuses anisotropic layout even if a caller overrides the option',()=>{
  const features=[feature('甲',75,20),feature('乙',130,50)];const {option}=buildChartOption({...cfg,mapScope:'china-province'},makeJoined(features));
  option.geo.preserveAspect=false;
  assert.throws(()=>renderSvg(option,{type:'FeatureCollection',features},3840,2160),/anisotropic|等比例/);
});
test('line overlays survive export independently from metric polygons',()=>{
  const features=[feature('甲',100,25),feature('乙',110,30)];const {option}=buildChartOption(cfg,makeJoined(features));
  const lines={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'source boundary'},geometry:{type:'MultiLineString',coordinates:[[[105,26],[105,29]]]}}]};
  const result=renderSvg(option,{type:'FeatureCollection',features},3840,2160,lines);
  assert.equal(result.diagnostics.lineSegmentCount,1);
  assert.match(result.svg,/stroke="#374151"/);
});
test('export separates coincident labels without deleting names',()=>{
  const features=Array.from({length:10},(_,i)=>feature(`区域${i}`,110+i*0.0001,25));
  const {option}=buildChartOption(cfg,makeJoined(features));
  const result=renderSvg(option,{type:'FeatureCollection',features},3840,2160);
  assert.equal(result.diagnostics.labels.count,10);
  assert.equal(result.diagnostics.labels.overlaps,0);
  for(let i=0;i<10;i++)assert.ok(result.svg.includes(`区域${i}`));
});
