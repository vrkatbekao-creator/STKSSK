import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVehiclePoint,unprojectVehiclePoint,clipVehicleSegment,vehicleRouteFragments} from '../src/game/vehicle-geometry.ts';
import {districts} from '../src/game/campaign-map.ts';

test('TWD97 projected coordinates match independent EPSG:3826 reference points',()=>{
 for(const [lon,lat,x,y] of [[121.5,25.03,120458.14997061627,-264193.57649756875],
  [121.969,25.48,167430.38268189528,-314299.4087375691],
  [121.156,24.686,85786.43519099883,-226008.06297404924]]){
  const actual=projectVehiclePoint(lon,lat);assert.ok(Math.hypot(actual[0]-x,actual[1]-y)<0.02);
 }
 assert.throws(()=>projectVehiclePoint(0,0),RangeError);
});
test('splits physical coverage at district and sector boundaries and excludes outside city',()=>{
 const districts=[{id:'6300100',rings:[[[0,0],[1500,0],[1500,1500],[0,1500],[0,0]]]},
  {id:'6300200',rings:[[[1500,0],[3000,0],[3000,1500],[1500,1500],[1500,0]]]}];
 const parts=clipVehicleSegment([-100,300],[3100,300],12800,'w:1:2',districts);
 assert.deepEqual(parts.map(p=>[p.district,p.sector,p.start,p.end]),[
  ['6300100','6300100:0,0',400,6400],['6300200','6300200:1,0',6400,12400]]);
});
test('reverse travel uses the same canonical road coverage and cannot invent an edge',()=>{
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:Float64Array.from([121.5,121.501]),latitudes:Float64Array.from([25.03,25.03]),
  offsets:Uint32Array.from([0,1,2]),targets:Uint32Array.from([1,0]),ways:BigUint64Array.from([9n,9n]),metres:Float64Array.from([100,100])};
 const [x,y]=projectVehiclePoint(121.5,25.03),districts=[{id:'6300100',rings:[[[x-100,y-100],[x+300,y-100],[x+300,y+100],[x-100,y+100],[x-100,y-100]]]}];
 const plan=(nodes,edges)=>({nodeIndices:nodes,edgeIndices:edges});
 const forward=vehicleRouteFragments(graph,plan([0,1],[0]),districts),reverse=vehicleRouteFragments(graph,plan([1,0],[1]),districts);
 assert.deepEqual(forward,[...reverse].reverse());
 assert.throws(()=>vehicleRouteFragments(graph,plan([1,0],[0]),districts),RangeError);
});
test('unprojectVehiclePoint round-trips every Kaohsiung district center within 1 mm',()=>{
 for(const d of districts){
  const [lon,lat]=unprojectVehiclePoint(d.center[0],d.center[1]);
  assert.ok(lon>=120.2&&lon<=120.7&&lat>=22.45&&lat<=23.05,`${d.id}: ${lon},${lat}`);
  const [px,py]=projectVehiclePoint(lon,lat);
  assert.ok(Math.hypot(px-d.center[0],py-d.center[1])<0.001,d.id);
 }
});
