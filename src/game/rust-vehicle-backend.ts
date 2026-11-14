import { districts } from './campaign-map.ts';
import { loadVerifiedVehicleBackend } from './vehicle-verified-backend.ts';
import type { CoverageDistrict } from './vehicle-geometry.ts';
import { preparedVehiclePolicy } from './rust-vehicle-policy.ts';

const assets = {
  graph: 'vehicle-graph-prototype-v3.bin.gz',
  metadata: 'vehicle-graph-prototype-v1.meta.json.gz',
  connectors: 'vehicle-connectors-prototype-v1.json.gz',
};
async function readGzip(url:string){
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('Vehicle package unavailable');
  if (response.headers.get('Content-Encoding') === 'gzip') return response.arrayBuffer();
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** The experimental browser mode uses the same SHA-verified packages as the Node audit. */
export function readRustVehicleBackend(base: string) {
  return loadVerifiedVehicleBackend(asset=>readGzip(base+assets[asset]), districts);
}

export async function readPreparedVehiclePolicy(base:string, districts:readonly CoverageDistrict[]){
  const bytes=await readGzip(base+preparedVehiclePolicy.filename);
  if(bytes.byteLength!==preparedVehiclePolicy.bytes)throw Error('Unexpected vehicle policy size');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==preparedVehiclePolicy.sha256)throw Error('Vehicle policy checksum mismatch');
  return {bytes,districtCodes:new Map(districts.map((d,i)=>[d.id,i+1])),forbiddenCount:new DataView(bytes).getUint32(8,true)};
}
