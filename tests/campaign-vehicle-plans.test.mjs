import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {streetCellMap,routingOutgoing,routingEdges} from '../src/game/campaign-map.ts';
import {newVehicleLedger} from '../src/game/vehicle-ledger.ts';
import {previewCampaignVehicleLeg} from '../src/game/campaign-vehicle-plans.ts';

test('preview combines real walking endpoints with pure vehicle accounting without mutating campaign',()=>{
 const g=initialCampaign(17,'blue','streets-v2'),u=g.units.find(x=>x.id==='blue1'),before=structuredClone(g);
 const start=streetCellMap.get(u.cellId).roadNode;
 const occupied=new Set(g.units.filter(x=>x.id!==u.id).map(x=>x.cellId));
 const edge=routingOutgoing[start].map(i=>routingEdges[i]).find(e=>e.metres<500&&!e.cellIds.some(c=>occupied.has(c)));
 assert.ok(edge);
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:new Float64Array(2),latitudes:new Float64Array(2),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([10n]),metres:Float64Array.from([300])};
 const context={graph,connectors:new Map([[start,[0]],[edge.to,[1]]]),allowTurn:()=>true,edgeWeightQuarters:()=>4};
 const ledger=newVehicleLedger(g.day,'blue');
 const preview=previewCampaignVehicleLeg(g,u,u.cellId,'drive',ledger,context,{ap:2,materials:1});
 assert.ok(preview);assert.equal(preview.vehicleAp,1);assert.equal(preview.materials,1);assert.deepEqual(g,before);
 assert.equal(previewCampaignVehicleLeg(g,u,u.cellId,'drive',{...ledger,day:2},context),null);
 assert.equal(previewCampaignVehicleLeg(g,u,u.cellId,'drive',ledger,context,{ap:100,materials:1}),null);
});
