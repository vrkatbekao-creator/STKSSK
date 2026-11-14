import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {parseVehicleTurnMetadata,createVehicleRuntime} from '../src/game/vehicle-runtime-factory.ts';
import {projectVehiclePoint} from '../src/game/vehicle-geometry.ts';

const metadata=()=>({format:'vehicle-graph-prototype-v1',sourceSha256:'fixture',turnRestrictions:[],viaNodesByWay:{}});
test('rejects invalid turn metadata before constructing a policy',()=>{
 assert.equal(parseVehicleTurnMetadata(metadata(),'fixture').relations.length,0);
 assert.throws(()=>parseVehicleTurnMetadata(metadata(),'wrong'));
 assert.throws(()=>parseVehicleTurnMetadata({...metadata(),turnRestrictions:[{id:1,tags:{},members:[{type:'w',ref:-1,role:'from'}]}]},'fixture'));
 assert.throws(()=>parseVehicleTurnMetadata({...metadata(),viaNodesByWay:{bad:[1]}},'fixture'));
});
test('runtime applies rain and faction-specific roadworks, and computes in-city exposure',()=>{
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:Float64Array.from([121.5,121.501]),latitudes:Float64Array.from([25.03,25.03]),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([9n]),metres:Float64Array.from([100,])};
 const [x,y]=projectVehiclePoint(121.5,25.03),district='6300500',districts=[{id:district,rings:[[[x-100,y-100],[x+300,y-100],[x+300,y+100],[x-100,y+100],[x-100,y-100]]]}];
 const runtime=createVehicleRuntime('a'.repeat(64),graph,new Map(),parseVehicleTurnMetadata(metadata(),'fixture'),districts);
 const game=initialCampaign(17,'blue','streets-v2');game.news='rain';game.surprise={id:'streetworks',districtId:district,responses:{blue:null,green:'adapt',white:null}};
 assert.equal(runtime.contextFor(game,'blue').edgeWeightQuarters(0),7);
 assert.equal(runtime.contextFor(game,'green').edgeWeightQuarters(0),5);
 assert.ok(runtime.fragmentsForRoute(game,'blue',{nodeIndices:[0,1],edgeIndices:[0]}).length>0);
});
