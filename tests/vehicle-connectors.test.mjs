import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVehicleConnectors} from '../src/game/vehicle-connectors.ts';
const expected={walkingRevision:'walk',vehicleRevision:'car',walkingNodes:5,vehicleNodes:8};
const source=()=>({format:'vehicle-connectors-prototype-v1',walkingRevision:'walk',vehicleRevision:'car',pairs:[[0,7],[3,1]]});
test('connector index preserves exact mapping for separately versioned graphs',()=>{
 assert.deepEqual([...parseVehicleConnectors(source(),expected)],[[0,[7]],[3,[1]]]);
});
test('rejects stale versions, duplicate, unsorted and out-of-range graph references',()=>{
 for(const data of [{...source(),vehicleRevision:'old'},{...source(),pairs:[[0,1],[0,2]]},
  {...source(),pairs:[[3,1],[2,2]]},{...source(),pairs:[[1,8]]},{...source(),pairs:[[5,0]]},
  {...source(),pairs:[[-1,0]]}])assert.throws(()=>parseVehicleConnectors(data,expected));
});
