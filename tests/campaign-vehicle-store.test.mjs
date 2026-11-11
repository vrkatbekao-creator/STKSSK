import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignStore} from '../src/game/campaign-store.ts';
import {createVehicleSaveContext} from '../src/game/vehicle-runtime-factory.ts';
import {initialCampaign} from '../src/game/campaign.ts';
import {encodeSave,saveKey} from '../src/game/campaign-save.ts';
import {mapFor,streetCellMap,routingOutgoing,routingEdges} from '../src/game/campaign-map.ts';
import {projectVehiclePoint,vehicleRouteFragments} from '../src/game/vehicle-geometry.ts';

function fixture(){
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const graph={ids:new BigUint64Array(),longitudes:new Float64Array(),latitudes:new Float64Array(),offsets:Uint32Array.from([0]),targets:new Uint32Array(),ways:new BigUint64Array(),metres:new Float64Array()};
 const connectors=new Map(),runtime={revision:'a'.repeat(64),contextFor:()=>({graph,connectors,allowTurn:()=>true,edgeWeightQuarters:()=>4}),fragmentsForRoute:()=>[]};
 return {data,storage,vehicle:{runtime,saveContext:createVehicleSaveContext(runtime,graph,connectors,[])}};
}
test('opt-in store persists, settles AI and resumes one authoritative schema 6 game',()=>{
 const {data,storage,vehicle}=fixture(),store=createCampaignStore(storage,'streets-v2',vehicle);
 store.getState().chooseSlot(2);store.getState().start();assert.equal(store.getState().saveError,null);
 assert.equal(JSON.parse(data.get(saveKey(2))).version,6);
 const unit=store.getState().game.units.find(u=>u.team==='blue');store.getState().dispatch({type:'streetCanvass',unitId:unit.id});
 assert.equal(store.getState().error,null);assert.equal(store.getState().saveError,null);
 store.getState().end();store.getState().end();assert.equal(store.getState().game.day,2);assert.equal(store.getState().saveError,null);
 const before=structuredClone(store.getState().game);store.getState().menu();assert.equal(store.getState().started,false);
 const again=createCampaignStore(storage,'streets-v2',vehicle);again.getState().chooseSlot(2);again.getState().resume();
 assert.equal(again.getState().saveError,null);assert.deepEqual(again.getState().game,before);
 assert.equal(data.has(saveKey(1)),false);assert.equal(data.has(saveKey(3)),false);
});
test('opt-in store reads an old slot without rewriting and starts vehicle rules next morning',()=>{
 const {data,storage,vehicle}=fixture(),game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(u=>u.id==='blue1');
 const session={game,selected:unit.id,districtId:mapFor(game).cells.get(unit.cellId).districtId,view:'city'};
 const raw=JSON.stringify(encodeSave(session));data.set(saveKey(1),raw);
 const store=createCampaignStore(storage,'streets-v2',vehicle);store.getState().resume();
 assert.equal(data.get(saveKey(1)),raw);assert.equal(store.getState().game.vehicle.activationDay,2);
 store.getState().end();store.getState().end();assert.equal(store.getState().game.day,2);
 assert.equal(store.getState().saveError,null);assert.equal(JSON.parse(data.get(saveKey(1))).version,6);
});
test('opt-in store saves and resumes a motorcade through real replay validation',()=>{
 const {data,storage}=fixture(),base=initialCampaign(17,'blue','streets-v2'),unit=base.units.find(u=>u.id==='blue1'),cell=streetCellMap.get(unit.cellId),start=cell.roadNode;
 const edge=routingOutgoing[start].map(i=>routingEdges[i]).find(e=>e.metres<500&&!e.cellIds.some(c=>base.units.some(u=>u.id!==unit.id&&u.cellId===c)));
 assert.ok(edge);const [x,y]=projectVehiclePoint(121.5,25.03),districts=[{id:cell.districtId,rings:[[[x-100,y-100],[x+500,y-100],[x+500,y+100],[x-100,y+100],[x-100,y-100]]]}];
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:Float64Array.from([121.5,121.502]),latitudes:Float64Array.from([25.03,25.03]),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([9n]),metres:Float64Array.from([1200])};
 const connectors=new Map([[start,[0]],[edge.to,[1]]]),runtime={revision:'a'.repeat(64),contextFor:()=>({graph,connectors,allowTurn:()=>true,edgeWeightQuarters:()=>4}),
  fragmentsForRoute:(_g,_t,p)=>vehicleRouteFragments(graph,p,districts)};
 const vehicle={runtime,saveContext:createVehicleSaveContext(runtime,graph,connectors,districts)},store=createCampaignStore(storage,'streets-v2',vehicle);
 store.getState().start();store.getState().vehicleDispatch({unitId:unit.id,mode:'motorcade',cellId:unit.cellId});
 assert.equal(store.getState().error,null);assert.equal(store.getState().saveError,null);
 const expected=structuredClone(store.getState().game);assert.equal(expected.vehicle.teams.blue.journal.journeys.length,1);
 const again=createCampaignStore(storage,'streets-v2',vehicle);again.getState().resume();
 assert.equal(again.getState().saveError,null);assert.deepEqual(again.getState().game,expected);
 assert.equal(JSON.parse(data.get(saveKey(1))).version,6);
});
test('opt-in store completes 28 days with AI histories and resumes the final result',()=>{
 const {storage,vehicle}=fixture(),store=createCampaignStore(storage,'streets-v2',vehicle);store.getState().start();
 for(let day=1;day<=28;day++){
  store.getState().end();assert.equal(store.getState().game.phase,'night');assert.equal(store.getState().saveError,null);
  store.getState().end();assert.equal(store.getState().saveError,null);
 }
 assert.ok(store.getState().game.result);const result=structuredClone(store.getState().game);
 const again=createCampaignStore(storage,'streets-v2',vehicle);again.getState().resume();
 assert.equal(again.getState().saveError,null);assert.deepEqual(again.getState().game,result);
});
