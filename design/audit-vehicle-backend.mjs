import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {districts} from '../src/game/campaign-map.ts';
import {loadVerifiedVehicleBackend} from '../src/game/vehicle-verified-backend.ts';

const files={graph:'.tools/vehicle-graph-prototype-v3.bin.gz',metadata:'.tools/vehicle-graph-prototype-v1.meta.json.gz',connectors:'.tools/vehicle-connectors-prototype-v1.json.gz'};
const bytes=Object.fromEntries(Object.entries(files).map(([key,path])=>{const b=gunzipSync(readFileSync(path));return [key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];}));
const start=performance.now(),backend=await loadVerifiedVehicleBackend(async key=>bytes[key],districts);
let rejected=false;const damaged=bytes.metadata.slice(0);new Uint8Array(damaged)[0]^=1;
try{await loadVerifiedVehicleBackend(async key=>key==='metadata'?damaged:bytes[key],districts);}catch{rejected=true;}
if(!rejected)throw Error('Corrupt metadata was accepted');
const report={status:'local Node prototype; not browser or production acceptance',revision:backend.runtime.revision,
 graphBytes:bytes.graph.byteLength,metadataBytes:bytes.metadata.byteLength,connectorBytes:bytes.connectors.byteLength,
 damagedMetadataRejected:rejected,elapsedMs:Math.round(performance.now()-start),rssBytes:process.memoryUsage().rss};
writeFileSync('artifacts/vehicle-backend-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
