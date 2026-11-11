import test from 'node:test';
import assert from 'node:assert/strict';
import {boardingRoutes} from '../src/game/vehicle-boarding.ts';

const edges=[{id:0,from:0,to:1,metres:200,effort:500},{id:1,from:0,to:2,metres:250,effort:250},
 {id:2,from:2,to:1,metres:150,effort:150},{id:3,from:1,to:3,metres:250,effort:250}];
const input={start:0,nodeCount:4,edges,outgoing:[[0,1],[3],[2],[]],incoming:[[],[0,2],[1],[3]],
 connectors:new Map([[1,[10]],[3,[30]]]),direction:'toVehicle',blocked:()=>false,edgeEffort:e=>e.effort};

test('keeps physical distance and weighted effort alternatives under the 600m limit',()=>{
 const routes=boardingRoutes(input),one=routes.filter(r=>r.vehicleNode===10),three=routes.find(r=>r.vehicleNode===30);
 assert.deepEqual(one.map(r=>[r.metres,r.effort,r.edgeIds]),[[400,400,[1,2]],[200,500,[0]]]);
 assert.deepEqual([three.metres,three.effort,three.edgeIds],[450,750,[0,3]]);
});
test('occupancy blocks traversal and reverse search returns forward-oriented walking edges',()=>{
 const blocked=boardingRoutes({...input,blocked:e=>e.id===0});
 assert.equal(blocked.some(r=>r.vehicleNode===30),false);
 const reverse=boardingRoutes({...input,start:3,direction:'fromVehicle',connectors:new Map([[0,[9]]])});
 assert.deepEqual(reverse.map(r=>r.edgeIds),[[0,3]]);
});
test('rejects malformed edges and never creates connectors across absent topology',()=>{
 assert.deepEqual(boardingRoutes({...input,connectors:new Map([[3,[30]]]),blocked:e=>e.id===3}),[]);
 assert.throws(()=>boardingRoutes({...input,edges:[{...edges[0],metres:-1},...edges.slice(1)]}),RangeError);
});
