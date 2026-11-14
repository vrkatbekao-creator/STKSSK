import { districts } from './campaign-map.ts';
import { loadVerifiedVehicleBackend } from './vehicle-verified-backend.ts';
import type { CoverageDistrict } from './vehicle-geometry.ts';
import { preparedVehiclePolicy } from './rust-vehicle-policy.ts';
import { readVehicleGzip, takeVehiclePackages } from './vehicle-packages.ts';

/** The experimental browser mode uses the same SHA-verified packages as the Node audit. */
export async function readRustVehicleBackend(base: string) {
  const packages=await takeVehiclePackages(base);
  return loadVerifiedVehicleBackend(asset=>Promise.resolve(packages[asset]), districts);
}

export async function readPreparedVehiclePolicy(base:string, districts:readonly CoverageDistrict[]){
  const bytes=await readVehicleGzip(base+preparedVehiclePolicy.filename);
  if(bytes.byteLength!==preparedVehiclePolicy.bytes)throw Error('Unexpected vehicle policy size');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==preparedVehiclePolicy.sha256)throw Error('Vehicle policy checksum mismatch');
  return {bytes,districtCodes:new Map(districts.map((d,i)=>[d.id,i+1])),forbiddenCount:new DataView(bytes).getUint32(8,true)};
}
