import test from 'node:test';
import assert from 'node:assert/strict';
import {planVehicleLeg} from '../src/game/vehicle-leg-planner.ts';
import {vehicleEdgeQuarterMetres} from '../src/game/vehicle-routing.ts';
import {quoteVehicleCost} from '../src/game/vehicle-cost.ts';
const graph={ids:BigUint64Array.from([1n,2n,3n]),longitudes:new Float64Array(3),latitudes:new Float64Array(3),
 offsets:Uint32Array.from([0,1,2,2]),targets:Uint32Array.from([2,2]),ways:BigUint64Array.from([10n,20n]),metres:Float64Array.from([100,600])};
const stop=(vehicleNode,metres,edgeIds)=>({walkingNode:vehicleNode,vehicleNode,metres,effort:metres,edgeIds});
const options={mode:'drive',origins:[stop(0,600,[1]),stop(1,0,[])],destinations:[stop(2,100,[2])],
 ap:14,materials:5,reservedAp:2,previousWeightedQuarterMetres:0,previousTeamQuarterMetres:0,
 allowTurn:()=>true,edgeWeightQuarters:()=>4};
test('compares complete walking and driving costs rather than choosing the shortest drive',()=>{
 const p=planVehicleLeg(graph,options);assert.equal(p.boarding.vehicleNode,1);
 assert.deepEqual(p.nodeIndices,[1,2]);assert.equal(p.vehicleAp,1);assert.equal(p.walkingAp,1);
 assert.equal(p.totalAp,2);assert.equal(p.materials,1);
});
test('enforces resource reserve and supports prepaid team travel allowance',()=>{
 assert.equal(planVehicleLeg(graph,{...options,ap:3}),null);
 assert.equal(planVehicleLeg(graph,{...options,materials:0}),null);
 const p=planVehicleLeg(graph,{...options,ap:3,materials:0,previousWeightedQuarterMetres:4,
  previousTeamQuarterMetres:4});
 assert.equal(p.vehicleAp,0);assert.equal(p.materials,0);assert.equal(p.totalAp,1);
});
test('respects occupied walking alternatives and refuses zero-length drives',()=>{
 assert.equal(planVehicleLeg(graph,{...options,origins:[]}),null);
 assert.equal(planVehicleLeg(graph,{...options,origins:[stop(2,0,[])]}),null);
 assert.throws(()=>planVehicleLeg(graph,{...options,destinations:[stop(2,100,[])]}),RangeError);
});
test('geographic lower bound retains the shortest choice within an equal AP band',()=>{
 const line={ids:BigUint64Array.from([1n,2n,3n,4n]),longitudes:Float64Array.from([121,121.001,121.002,121.003]),
  latitudes:Float64Array.from([25,25,25,25]),offsets:Uint32Array.from([0,2,3,4,4]),
  targets:Uint32Array.from([1,3,2,3]),ways:BigUint64Array.from([1n,2n,1n,1n]),metres:Float64Array.from([120,500,120,120])};
 const result=planVehicleLeg(line,{...options,origins:[stop(0,0,[])],destinations:[stop(3,0,[])],reservedAp:0});
 assert.equal(result.totalAp,1);assert.equal(result.actualQuarterMetres,1440);assert.deepEqual(result.nodeIndices,[0,1,2,3]);
});
test('combined search matches exhaustive enumeration on small directed geographic graphs',()=>{
 for(let seed=1;seed<=20;seed++){
  const targets=[],ways=[],metres=[],offsets=[0],n=6;
  for(let i=0;i<n;i++){for(let j=i+1;j<n;j++){if((i*7+j*11+seed)%4===0)continue;targets.push(j);ways.push(BigInt(100+targets.length));metres.push(125*(j-i)+(i*13+j*17+seed)%31);}offsets.push(targets.length);}
  const g={ids:BigUint64Array.from([1n,2n,3n,4n,5n,6n]),longitudes:Float64Array.from({length:n},(_,i)=>121+i*.001),
   latitudes:Float64Array.from({length:n},()=>25),offsets:Uint32Array.from(offsets),targets:Uint32Array.from(targets),ways:BigUint64Array.from(ways),metres:Float64Array.from(metres)};
  const origins=[stop(0,0,[]),stop(1,240,[1])],destinations=[stop(4,200,[2]),stop(5,0,[])];
  const o={...options,origins,destinations,mode:seed%2?'drive':'motorcade',ap:12,reservedAp:2,
   previousWeightedQuarterMetres:(seed%3)*1000,previousTeamQuarterMetres:(seed%2)*1000,
   edgeWeightQuarters:e=>e%2?5:4};
  let best=null;
  const visit=(node,actual,weighted,origin,depth)=>{
   if(depth)for(const end of destinations.filter(x=>x.vehicleNode===node)){
    const cost=quoteVehicleCost({mode:o.mode,previousWeightedQuarterMetres:o.previousWeightedQuarterMetres,
      addedWeightedQuarterMetres:weighted,previousTeamQuarterMetres:o.previousTeamQuarterMetres,addedTeamQuarterMetres:actual});
    const foot=r=>r.edgeIds.length?Math.max(1,Math.ceil((r.effort-1e-6)/200)):0;
    const ap=foot(origin)+foot(end)+cost.ap,dist=origin.metres+end.metres+actual/4;
    if(ap+o.reservedAp<=o.ap&&cost.supplies<=o.materials&&(!best||ap<best.ap||ap===best.ap&&dist<best.dist))best={ap,dist};
   }
   for(let e=g.offsets[node];e<g.offsets[node+1];e++){const d=vehicleEdgeQuarterMetres(g.metres[e]);visit(g.targets[e],actual+d,weighted+Math.ceil(d*o.edgeWeightQuarters(e)/4),origin,depth+1);}
  };
  for(const origin of origins)visit(origin.vehicleNode,0,0,origin,0);
  const actual=planVehicleLeg(g,o);assert.equal(actual?.totalAp??null,best?.ap??null,`seed ${seed}`);
  if(actual)assert.equal(actual.boarding.metres+actual.alighting.metres+actual.actualQuarterMetres/4,best.dist,`seed ${seed}`);
 }
});
