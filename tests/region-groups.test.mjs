import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRegionGroups } from '../scripts/lib/region-groups.mjs';
import { buildChartOption } from '../scripts/lib/options.mjs';
test('group retains geometry, sums disjoint rows and suppresses only lowest bubbles', () => {
  const records = ['China','Taiwan','Other'].map((name,i) => ({feature:{type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[[[i,0],[i+1,0],[i+1,1],[i,0]]]}},value:[460,300,99][i],displayName:name,row:{name,value:[460,300,99][i]}}));
  const geojson={features:records.map(r=>r.feature)};
  const joined={matchedFeatures:records,unmatchedFeatures:[]};
  const config={geoKey:{name:'name'},metricKey:'value',regionGroups:[{target:'China',members:['China','Taiwan'],valuesAreDisjoint:true}],mode:'bubble',paletteId:'mixed-c',classes:5,classification:{method:'custom',source:'user-defined',thresholds:[0,100,200,300,400]},title:'Test'};
  applyRegionGroups(geojson,joined,config);
  assert.equal(geojson.features.length,2);
  assert.equal(joined.matchedFeatures.at(-1).value,760);
  assert.equal(geojson.features.at(-1).geometry.coordinates.length,2);
  assert.equal(joined.matchedFeatures.at(-1).row.sourceRows.length,2);
  const built=buildChartOption(config,joined);
  assert.deepEqual(built.option.series[1].data.map(r=>r.name),['China']);
  assert.equal(built.classification.classCounts.reduce((a,b)=>a+b),2);
  assert.equal(built.presentation.legend.lowestClassSymbol,'base-map-only');
});
