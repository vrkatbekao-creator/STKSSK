import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {mapFor} from '../src/game/campaign-map.ts';
import {encodeSave} from '../src/game/campaign-save.ts';
import {decodeVehicleSave,encodeVehicleSave} from '../src/game/campaign-vehicle-save.ts';
const revision='a'.repeat(64);
const graph={ids:new BigUint64Array(),longitudes:new Float64Array(),latitudes:new Float64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array(),ways:new BigUint64Array(),metres:new Float64Array()};
const ctx={revision,journalContext:(game,team)=>({revision,day:game.day,phase:game.phase,team,
 unitIds:game.units.filter(u=>u.team===team).map(u=>u.id),graph,walkingEdges:[],cellRoadNode:new Map(),connectors:new Map(),allowTurn:()=>true})};
const fixture=()=>{const game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(u=>u.id==='blue1');
 return {game,selected:unit.id,districtId:mapFor(game).cells.get(unit.cellId).districtId,view:'city'};};
test('schema 5 migration remains in memory and preserves existing resources, seed and location',()=>{
 const session=fixture(),raw=JSON.stringify(encodeSave(session,'2026-11-11T00:00:00.000Z'));
 const decoded=decodeVehicleSave(raw,ctx);assert.equal(decoded.error,null);assert.equal(decoded.migrated,true);
 assert.equal(decoded.session.game.vehicle.activationDay,2);
 const {vehicle,...game}=decoded.session.game;assert.deepEqual(game,session.game);
 assert.equal(JSON.parse(raw).version,5);
 const saved=encodeVehicleSave(decoded.session,ctx,'2026-11-11T00:00:00.000Z');
 assert.equal(saved.version,6);const reloaded=decodeVehicleSave(JSON.stringify(saved),ctx);
 assert.equal(reloaded.error,null);assert.equal(reloaded.migrated,false);assert.deepEqual(reloaded.session,decoded.session);
});
test('schema 6 rejects tampering, incompatible vehicle revision and malformed timestamps',()=>{
 const legacy=JSON.stringify(encodeSave(fixture(),'2026-11-11T00:00:00.000Z'));
 const session=decodeVehicleSave(legacy,ctx).session,saved=encodeVehicleSave(session,ctx,'2026-11-11T00:00:00.000Z');
 const tampered=structuredClone(saved);tampered.session.game.units[0].ap++;
 assert.equal(decodeVehicleSave(JSON.stringify(tampered),ctx).error,'c_saveInvalid');
 assert.equal(decodeVehicleSave(JSON.stringify(saved),{...ctx,revision:'b'.repeat(64)}).error,'c_saveIncompatible');
 assert.throws(()=>encodeVehicleSave(session,ctx,'not-a-date'));
});
