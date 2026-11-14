import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleRoute,vehicleEdgeQuarterMetres} from '../src/game/vehicle-routing.ts';

// 0→1→2 is short but forbidden for incoming road 10; 0→3→2 is legal.
const graph={ids:BigUint64Array.from([100n,101n,102n,103n]),longitudes:new Float64Array(4),latitudes:new Float64Array(4),
 offsets:Uint32Array.from([0,2,3,3,4]),targets:Uint32Array.from([1,3,2,2]),
 ways:BigUint64Array.from([10n,30n,20n,40n]),metres:Float64Array.from([100,300,100,300])};
const policy={allowTurn:(a,n,b)=>!(a===10n&&n===101n&&b===20n),edgeWeightQuarters:()=>4,maxWeightedQuarterMetres:10000};
test('routes respect turns and retain ordered road edges',()=>{
 const result=vehicleRoute(graph,0,2,policy);
 assert.deepEqual(result.nodeIndices,[0,3,2]);assert.deepEqual(result.edgeIndices,[1,3]);
 assert.equal(result.actualQuarterMetres,2400);assert.equal(result.weightedQuarterMetres,2400);
 assert.equal(vehicleRoute(graph,2,0,policy),null);
});
test('weighted road cost, range and split-edge quantization are stable',()=>{
 const wet={...policy,edgeWeightQuarters:()=>5};const r=vehicleRoute(graph,0,2,wet);
 assert.equal(r.actualQuarterMetres,2400);assert.equal(r.weightedQuarterMetres,3000);
 assert.equal(vehicleRoute(graph,0,2,{...wet,maxWeightedQuarterMetres:2999}),null);
 assert.equal(vehicleRoute(graph,0,0,policy),null);
 assert.equal(vehicleEdgeQuarterMetres(0.01),1);
 assert.throws(()=>vehicleEdgeQuarterMetres(NaN),RangeError);
});
test('a longer arrival at the same junction remains available when its turn is legal',()=>{
 const g={ids:BigUint64Array.from([1n,2n,3n,4n]),longitudes:new Float64Array(4),latitudes:new Float64Array(4),
  offsets:Uint32Array.from([0,2,3,3,4]),targets:Uint32Array.from([1,3,2,1]),
  ways:BigUint64Array.from([10n,30n,20n,40n]),metres:Float64Array.from([10,20,10,20])};
 const p={allowTurn:(a,n,b)=>!(a===10n&&n===2n&&b===20n),edgeWeightQuarters:()=>4,maxWeightedQuarterMetres:1000};
 assert.deepEqual(vehicleRoute(g,0,2,p).nodeIndices,[0,3,1,2]);
});
