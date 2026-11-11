import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {mapFor} from '../src/game/campaign-map.ts';
import {encodeSave,saveKey} from '../src/game/campaign-save.ts';
import {readVehicleSlot,writeVehicleSlot} from '../src/game/campaign-vehicle-slots.ts';

const revision='a'.repeat(64),graph={ids:new BigUint64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array()};
const context={revision,journalContext:(game,team)=>({revision,day:game.day,phase:game.phase,team,
 unitIds:game.units.filter(u=>u.team===team).map(u=>u.id),graph,walkingEdges:[],cellRoadNode:new Map(),connectors:new Map(),allowTurn:()=>true})};
const makeSession=()=>{const game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(u=>u.id==='blue1');
 return {game,selected:unit.id,districtId:mapFor(game).cells.get(unit.cellId).districtId,view:'city'};};
test('three slots migrate only in memory, reject invalid writes, and remain independent',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const legacy=JSON.stringify(encodeSave(makeSession(),'2026-11-11T00:00:00.000Z'));
 data.set(saveKey(1),legacy);data.set(saveKey(2),'broken');
 const loaded=readVehicleSlot(storage,1,context);assert.equal(loaded.migrated,true);assert.equal(data.get(saveKey(1)),legacy);
 assert.equal(readVehicleSlot(storage,2,context).error,'c_saveInvalid');
 assert.equal(writeVehicleSlot(storage,3,loaded.session,context).error,null);
 assert.equal(readVehicleSlot(storage,3,context).session.game.vehicle.activationDay,2);
 assert.equal(data.get(saveKey(1)),legacy);assert.equal(data.get(saveKey(2)),'broken');
 const before=data.get(saveKey(3)),bad=structuredClone(loaded.session);bad.game.units[0].ap=-1;
 assert.equal(writeVehicleSlot(storage,3,bad,context).error,'c_saveInvalid');assert.equal(data.get(saveKey(3)),before);
 const full={...storage,setItem:()=>{throw Error('quota');}};
 assert.equal(writeVehicleSlot(full,3,loaded.session,context).error,'c_saveUnavailable');assert.equal(data.get(saveKey(3)),before);
});
