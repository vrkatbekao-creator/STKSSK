import test from 'node:test';
import assert from 'node:assert/strict';
import {preloadVehiclePackages,takeVehiclePackages} from '../src/game/vehicle-packages.ts';

test('the campaign reuses vehicle downloads started before the walking graph loads',async t=>{
 const requests=[];
 const response=new Response(Uint8Array.of(1),{headers:{'Content-Encoding':'gzip'}});
 t.mock.method(globalThis,'fetch',url=>{
  requests.push(url);
  return Promise.resolve(response.clone());
 });
 const base='https://example.invalid/map/';
 preloadVehiclePackages(base);
 preloadVehiclePackages(base);
 assert.equal(requests.length,3);
 const packages=await takeVehiclePackages(base);
 assert.equal(requests.length,3);
 assert.deepEqual(Object.values(packages).map(bytes=>bytes.byteLength),[1,1,1]);
});

test('failed speculative downloads can be retried directly',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',()=>Promise.resolve(++calls<=3?new Response(null,{status:503}):
  new Response(Uint8Array.of(1),{headers:{'Content-Encoding':'gzip'}})));
 const base='https://example.invalid/retry/';
 preloadVehiclePackages(base);
 assert.equal((await takeVehiclePackages(base)).graph.byteLength,1);
 assert.equal(calls,6);
});
