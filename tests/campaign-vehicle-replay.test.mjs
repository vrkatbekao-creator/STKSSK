import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {mapFor,streetCellMap,routingEdges} from '../src/game/campaign-map.ts';
import {touchOutreach} from '../src/game/campaign-outreach.ts';
import {initialVehicleState,advanceVehicleState} from '../src/game/campaign-vehicle-state.ts';
import {campaignVehicleCommand} from '../src/game/campaign-vehicle-runtime.ts';
import {vehicleRouteFragments,projectVehiclePoint} from '../src/game/vehicle-geometry.ts';
import {replayVehicleExposure} from '../src/game/campaign-vehicle-replay.ts';
import {encodeVehicleSave,decodeVehicleSave} from '../src/game/campaign-vehicle-save.ts';

test('replays mixed walking and motorcade geometry for a real schema 6 roundtrip and rejects forged history',()=>{
 let game=initialCampaign(17,'blue','streets-v2');const unit=game.units.find(u=>u.id==='blue1'),cell=streetCellMap.get(unit.cellId),start=cell.roadNode;
 const [x,y]=projectVehiclePoint(121.5,25.03),districts=[{id:cell.districtId,rings:[[[x-100,y-100],[x+500,y-100],[x+500,y+100],[x-100,y+100],[x-100,y-100]]]}];
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:Float64Array.from([121.5,121.502]),latitudes:Float64Array.from([25.03,25.03]),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([9n]),metres:Float64Array.from([1200])};
 const edge=routingEdges.find(e=>e.from===start&&e.metres<500),context={graph,connectors:new Map([[start,[0]],[edge.to,[1]]]),allowTurn:()=>true,edgeWeightQuarters:()=>4};
 const revision='a'.repeat(64);game.vehicle=initialVehicleState(game,revision,'new');
 touchOutreach(game,'blue',unit.cellId,8);
 const runtime={revision,contextFor:()=>context,fragmentsForRoute:(_g,_t,p)=>vehicleRouteFragments(graph,p,districts)};
 const result=campaignVehicleCommand(game,'blue',{unitId:unit.id,mode:'motorcade',cellId:unit.cellId},runtime);
 assert.equal(result.error,undefined);game=result.game;touchOutreach(game,'blue',unit.cellId,8);
 const verify=(g,t,s)=>replayVehicleExposure(g,t,s,graph,districts);
 assert.equal(verify(game,'blue',game.vehicle.teams.blue),true);
 const ctx={revision,journalContext:(g,team)=>({revision,day:g.day,phase:g.phase,team,
  unitIds:g.units.filter(u=>u.team===team).map(u=>u.id),graph,walkingEdges:routingEdges,
  cellRoadNode:new Map([[unit.cellId,start]]),connectors:context.connectors,allowTurn:context.allowTurn}),verifyExposure:verify};
 const session={game,selected:unit.id,districtId:mapFor(game).cells.get(unit.cellId).districtId,view:'street'};
 const saved=encodeVehicleSave(session,ctx,'2026-11-11T00:00:00.000Z');
 assert.deepEqual(decodeVehicleSave(JSON.stringify(saved),ctx).session,session);
 const forged=structuredClone(session);forged.game.vehicle.teams.blue.history.events.shift();
 assert.throws(()=>encodeVehicleSave(forged,ctx,'2026-11-11T00:00:00.000Z'));
 const skipped=structuredClone(session);skipped.game.vehicle.teams.blue.history.events=skipped.game.vehicle.teams.blue.history.events.filter(e=>e.kind!=='motorcade');
 assert.throws(()=>encodeVehicleSave(skipped,ctx,'2026-11-11T00:00:00.000Z'));
 const tomorrow=structuredClone(game);tomorrow.day=2;tomorrow.vehicle=advanceVehicleState(tomorrow.vehicle,2,tomorrow);
 assert.equal(verify(tomorrow,'blue',tomorrow.vehicle.teams.blue),true);
});

test('migrated foot history snapshots at the next morning without inventing earlier actions',()=>{
 const game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(u=>u.id==='blue1');
 game.vehicle=initialVehicleState(game,'a'.repeat(64),'migrated');
 touchOutreach(game,'blue',unit.cellId,8);
 assert.equal(game.vehicle.teams.blue.history.baseline,null);
 assert.equal(game.vehicle.teams.blue.history.events.length,0);
 game.day=2;game.vehicle=advanceVehicleState(game.vehicle,2,game);
 assert.deepEqual(game.vehicle.teams.blue.history.baseline,game.outreach.blue.sectors);
 touchOutreach(game,'blue',unit.cellId,8);
 assert.equal(game.vehicle.teams.blue.history.events.length,1);
 const graph={ids:new BigUint64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array()};
 assert.equal(replayVehicleExposure(game,'blue',game.vehicle.teams.blue,graph,[]),true);
 game.vehicle.teams.blue.history.baseline[Object.keys(game.outreach.blue.sectors)[0]].day=2;
 assert.equal(replayVehicleExposure(game,'blue',game.vehicle.teams.blue,graph,[]),false);
});
