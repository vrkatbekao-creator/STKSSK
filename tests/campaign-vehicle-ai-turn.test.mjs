import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign,automatedFactionTurn} from '../src/game/campaign.ts';
import {streetCellMap,allCells} from '../src/game/campaign-map.ts';
import {sectorKey} from '../src/game/campaign-outreach.ts';
import {initialVehicleState} from '../src/game/campaign-vehicle-state.ts';
import {chooseAiVehicleStop} from '../src/game/campaign-vehicle-ai.ts';
import {automatedVehicleFactionTurn} from '../src/game/campaign-vehicle-ai-turn.ts';

test('opt-in AI uses the same drive executor and records the journey before normal actions',()=>{
 const game=initialCampaign(17,'blue','streets-v2');game.news='clear';game.surprise=null;
 const team='green',unit=game.units.find(u=>u.id==='green1'),candidate=chooseAiVehicleStop(game,unit,()=>({totalAp:1,materials:1}),1);
 assert.ok(candidate);
 const start=streetCellMap.get(unit.cellId).roadNode,end=streetCellMap.get(candidate.cellId).roadNode;
 assert.notEqual(start,end);
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:new Float64Array(2),latitudes:new Float64Array(2),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([10n]),metres:Float64Array.from([300])};
 const context={graph,connectors:new Map([[start,[0]],[end,[1]]]),allowTurn:()=>true,edgeWeightQuarters:()=>4};
 const vehicle=initialVehicleState(game,'a'.repeat(64),'new'),before=structuredClone(game);
 const result=automatedVehicleFactionTurn(game,vehicle,team,context,{recruit:false});
 assert.equal(result.error,undefined);assert.equal(result.vehicle.teams.green.journal.journeys.length,1);
 assert.equal(result.vehicle.teams.green.journal.ledger.actualQuarterMetres,1200);
 assert.equal(result.vehicle.teams.green.journal.journeys[0].mode,'drive');
 assert.equal(vehicle.teams.green.journal.journeys.length,0);assert.deepEqual(game,before);
});
test('vehicle-mode AI can disable both legacy free-standing transport commands',()=>{
 const game=initialCampaign(17,'blue','streets-v2');game.day=4;game.news='clear';game.surprise=null;
 const result=automatedFactionTurn(game,'green',{recruit:false,disableTransport:true});
 assert.equal(result.logs.some(log=>log.values.action==='transport'||log.values.action==='siteTransfer'),false);
});
test('opt-in AI motorcade uses shared exposure before the ordinary canvass',()=>{
 const game=initialCampaign(17,'blue','streets-v2');game.news='clear';game.surprise=null;
 const team='green',unit=game.units.find(u=>u.id==='green1'),candidate=chooseAiVehicleStop(game,unit,()=>({totalAp:1,materials:1}),1);
 const start=streetCellMap.get(unit.cellId).roadNode,end=streetCellMap.get(candidate.cellId).roadNode;
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:new Float64Array(2),latitudes:new Float64Array(2),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([10n]),metres:Float64Array.from([1200])};
 const context={graph,connectors:new Map([[start,[0]],[end,[1]]]),allowTurn:()=>true,edgeWeightQuarters:()=>4};
 const vehicle=initialVehicleState(game,'a'.repeat(64),'new');game.vehicle=vehicle;
 const district=allCells.get(candidate.cellId).districtId,sector=sectorKey(allCells.get(candidate.cellId));
 const result=automatedVehicleFactionTurn(game,vehicle,team,context,{recruit:false,motorcade:true,
  fragmentsForRoute:()=>[{segment:'road:1',district,sector,start:0,end:4800,segmentLength:4800}]});
 assert.equal(result.error,undefined);assert.equal(result.vehicle.teams.green.journal.journeys[0].mode,'motorcade');
 assert.equal(result.vehicle.teams.green.exposure.awarded,1);
 assert.equal(result.game.vehicle.teams.green.exposure.awarded,1);
 assert.equal(game.vehicle.teams.green.journal.journeys.length,0);
});
