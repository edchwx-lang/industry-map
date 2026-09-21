import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChartOption}from '../scripts/lib/options.mjs';
import {renderSvg}from '../scripts/lib/export.mjs';
const feature=(name,i)=>({type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[[[i*10,0],[i*10+5,0],[i*10+5,5],[i*10,5],[i*10,0]]]}});
const fixture=()=>{const values=[0,99,100,200,300,400];return {matchedFeatures:values.map((value,i)=>({feature:feature(`Country${i}`,i),value,row:{value}})),unmatchedFeatures:[feature('Missing',6)]};};
const config={title:'test',geoKey:{name:'name'},mapScope:'world',mode:'choropleth',paletteId:'blue-a',classes:5,classification:{method:'custom',source:'user-defined',thresholds:[0,100,200,300,400]}};
for(const mode of ['choropleth','bubble'])test(`${mode}: world hides lowest-class names without removing data`,()=>{
 const joined=fixture(),built=buildChartOption({...config,mode},joined);
 assert.deepEqual(built.option.series.at(-1).data.map(d=>d.name),['Country2','Country3','Country4','Country5']);
 assert.equal(built.option.series[0].data.length,7);
 assert.deepEqual(built.classification.classCounts,[2,1,1,1,1]);
 const result=renderSvg(built.option,{type:'FeatureCollection',features:[...joined.matchedFeatures.map(r=>r.feature),...joined.unmatchedFeatures]},3840,2160);
 assert.equal(result.diagnostics.labels.count,4);assert.ok(!result.svg.includes('>Country0</text>'));assert.ok(result.svg.includes('>Country2</text>'));
});
test('regional and provincial maps keep lowest-class labels',()=>{
 for(const mapScope of ['regional','china-province'])for(const mode of ['choropleth','bubble'])assert.equal(buildChartOption({...config,mapScope,mode},fixture()).option.series.at(-1).data.length,7);
});
test('world automatic classification uses its actual lowest class, not a fixed cutoff',()=>{
 const joined=fixture();joined.matchedFeatures.forEach((r,i)=>r.value=i*10);
 const built=buildChartOption({...config,classes:3,classification:{method:'equal',source:'user-confirmed'}},joined);
 assert.deepEqual(built.option.series.at(-1).data.map(d=>d.name),['Country2','Country3','Country4','Country5']);
});
test('labels use bold opaque dark text with no white plate or halo',()=>{
 const built=buildChartOption(config,fixture());const style=built.option.series.at(-1).label;
 assert.equal(style.fontWeight,700);assert.ok(!style.backgroundColor || style.backgroundColor==='transparent');
 assert.equal(style.opacity,1);assert.equal(style.textBorderWidth,0);assert.equal(style.textShadowBlur,0);
});
