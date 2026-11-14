import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {initialVehicleState,advanceVehicleState,vehicleActive} from '../src/game/campaign-vehicle-state.ts';
const revision='a'.repeat(64);
test('old road games switch on the next morning without changing resources or history',()=>{
 const game=initialCampaign(17,'blue','streets-v2');game.day=10;game.phase='night';const before=structuredClone(game);
 const state=initialVehicleState(game,revision,'migrated');assert.equal(state.activationDay,11);
 assert.equal(vehicleActive(state,10),false);assert.equal(vehicleActive(state,11),true);assert.deepEqual(game,before);
 assert.deepEqual(Object.keys(state.teams).sort(),['blue','green','white']);
 const tomorrow=advanceVehicleState(state,11);assert.equal(tomorrow.teams.blue.journal.ledger.day,11);
 assert.equal(tomorrow.teams.blue.exposure.day,11);assert.deepEqual(state.teams.blue.journal.journeys,[]);
});
test('day 28 and legacy hex stay on old rules while new road games start enabled',()=>{
 const road=initialCampaign(17,'blue','streets-v2');road.day=28;
 assert.equal(initialVehicleState(road,revision,'migrated').activationDay,null);
 assert.equal(initialVehicleState(initialCampaign(17,'blue','streets-v2'),revision,'new').activationDay,1);
 const legacy=initialCampaign(17,'blue','legacy-hex');assert.equal(initialVehicleState(legacy,revision,'migrated').activationDay,null);
 assert.throws(()=>initialVehicleState(road,'wrong','migrated'),RangeError);
});
