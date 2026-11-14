import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {initialVehicleState} from '../src/game/campaign-vehicle-state.ts';
import {endVehicleCampaignPhase} from '../src/game/campaign-vehicle-phase.ts';
import {replayVehicleExposure} from '../src/game/campaign-vehicle-replay.ts';

test('vehicle-enabled phase preserves day/night clock, opponent order and morning ledgers',()=>{
 const game=initialCampaign(17,'blue','streets-v2'),before=structuredClone(game),vehicle=initialVehicleState(game,'a'.repeat(64),'new');
 const called=[],graph={ids:new BigUint64Array(),longitudes:new Float64Array(),latitudes:new Float64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array(),ways:new BigUint64Array(),metres:new Float64Array()};
 const contextFor=(_game,team)=>{called.push(team);return {graph,connectors:new Map(),allowTurn:()=>true,edgeWeightQuarters:()=>4};};
 const night=endVehicleCampaignPhase(game,vehicle,contextFor);
 assert.equal(night.game.phase,'night');assert.deepEqual(called,[]);assert.equal(night.vehicle.teams.blue.journal.ledger.day,1);
 const morning=endVehicleCampaignPhase(night.game,night.vehicle,contextFor);
 assert.deepEqual(called,['green','white']);assert.equal(morning.game.day,2);assert.equal(morning.game.phase,'day');
 for(const team of ['blue','green','white']){assert.equal(morning.vehicle.teams[team].journal.ledger.day,2);assert.equal(morning.vehicle.teams[team].exposure.day,2);}
 assert.deepEqual(game,before);
});

test('AI foot actions remain in the shared history across night settlement',()=>{
 const game=initialCampaign(17,'blue','streets-v2');game.vehicle=initialVehicleState(game,'a'.repeat(64),'new');
 const graph={ids:new BigUint64Array(),longitudes:new Float64Array(),latitudes:new Float64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array(),ways:new BigUint64Array(),metres:new Float64Array()};
 const context=()=>({graph,connectors:new Map(),allowTurn:()=>true,edgeWeightQuarters:()=>4});
 const night=endVehicleCampaignPhase(game,game.vehicle,context),morning=endVehicleCampaignPhase(night.game,night.vehicle,context);
 const events=['green','white'].flatMap(team=>morning.game.vehicle.teams[team].history.events);
 assert.ok(events.some(event=>event.kind==='foot'));
 for(const team of ['blue','green','white'])assert.equal(replayVehicleExposure(morning.game,team,morning.game.vehicle.teams[team],graph,[]),true);
});
