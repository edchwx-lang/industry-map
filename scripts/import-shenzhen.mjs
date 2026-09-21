import { fileURLToPath } from 'node:url';
export { importShenzhen } from './lib/import-shenzhen.mjs';
import { importShenzhen } from './lib/import-shenzhen.mjs';
if(process.argv[1]===fileURLToPath(import.meta.url)){ const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,x)=>i%2?a:[...a,[v.replace(/^--/,''),x[i+1]]],[])); if(!args.sourceBase||!args.output) throw new Error('usage: node scripts/import-shenzhen.mjs --sourceBase <base> --output <geojson>'); console.log(JSON.stringify(await importShenzhen({sourceBase:args.sourceBase,outputPath:args.output}),null,2)); }
