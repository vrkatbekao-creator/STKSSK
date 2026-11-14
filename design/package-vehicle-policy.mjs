import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {districts} from '../src/game/campaign-map.ts';
import {encodeVehiclePolicy,preparedVehiclePolicy} from '../src/game/rust-vehicle-policy.ts';
import {loadVerifiedVehicleBackend} from '../src/game/vehicle-verified-backend.ts';

const output = new URL('../public/alpha-data/',import.meta.url);
const filenames = {
 graph: 'vehicle-graph-prototype-v3.bin.gz',
 metadata: 'vehicle-graph-prototype-v1.meta.json.gz',
 connectors: 'vehicle-connectors-prototype-v1.json.gz',
};
const backend = await loadVerifiedVehicleBackend(async asset => {
 const raw = gunzipSync(await readFile(new URL(filenames[asset],output)));
 return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
},districts);
const {bytes,forbiddenCount} = encodeVehiclePolicy(backend.graph,backend.turns,backend.districts);
const data = Buffer.from(bytes);
const sha256=createHash('sha256').update(data).digest('hex');
if(data.length!==preparedVehiclePolicy.bytes||sha256!==preparedVehiclePolicy.sha256){
 throw Error(`Update the policy identity for the new road data (${data.length} bytes, SHA-256 ${sha256})`);
}
const packed = gzipSync(data,{level:9});
await writeFile(new URL(preparedVehiclePolicy.filename,output),packed);
console.log(JSON.stringify({bytes:data.length,packed:packed.length,forbiddenCount,sha256}));
