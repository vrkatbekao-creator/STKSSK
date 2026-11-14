import test from 'node:test';
import assert from 'node:assert/strict';
import {validVehicleJournal} from '../src/game/vehicle-journal.ts';
const graph={ids:BigUint64Array.from([1n,2n]),longitudes:new Float64Array(2),latitudes:new Float64Array(2),
 offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([10n]),metres:Float64Array.from([300])};
const ctx={revision:'rev',day:1,phase:'day',team:'blue',unitIds:['blue1'],graph,
 walkingEdges:[{from:0,to:1,metres:100},{from:2,to:3,metres:100}],cellRoadNode:new Map([['a',0],['b',3]]),
 connectors:new Map([[1,[0]],[2,[1]]]),allowTurn:()=>true};
const journal=()=>({revision:'rev',ledger:{day:1,team:'blue',actualQuarterMetres:1200,units:{blue1:{drive:1200,motorcade:0}}},
 journeys:[{day:1,phase:'day',unitId:'blue1',mode:'drive',fromCell:'a',toCell:'b',boardEdges:[0],carStart:0,
  carEdges:[0],weights:[4],alightStart:2,alightEdges:[1],actualQuarterMetres:1200,weightedQuarterMetres:1200}]});
test('validates source-connected walking, car edges, costs and daily ledger together',()=>{
 assert.equal(validVehicleJournal(journal(),ctx),true);
 const empty={revision:'rev',ledger:{day:1,team:'blue',actualQuarterMetres:0,units:{}},journeys:[]};
 assert.equal(validVehicleJournal(empty,ctx),true);
});
test('rejects tampered paths, costs, revisions and daily counters',()=>{
 const changed=(fn)=>{const j=journal();fn(j);return j;};
 for(const bad of [changed(j=>j.revision='old'),changed(j=>j.journeys[0].boardEdges=[]),
  changed(j=>j.journeys[0].carStart=1),changed(j=>j.journeys[0].weights=[5]),
  changed(j=>j.journeys[0].actualQuarterMetres=1199),changed(j=>j.ledger.actualQuarterMetres=1199),
  changed(j=>j.journeys[0].phase='night'),changed(j=>j.journeys[0].alightEdges=[])]){
  assert.equal(validVehicleJournal(bad,ctx),false);
 }
});
