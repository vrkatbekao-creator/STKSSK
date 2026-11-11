/** Validation for an independently revisioned source-node connector index. */
export type VehicleConnectors={walkingRevision:string;vehicleRevision:string;pairs:[number,number][]};

/** Caller authenticates the file SHA and supplies trusted graph revisions and sizes. */
export function parseVehicleConnectors(value:unknown,expected:{walkingRevision:string;vehicleRevision:string;walkingNodes:number;vehicleNodes:number}):Map<number,number[]>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid vehicle connectors');
 const v=value as Partial<VehicleConnectors>&{format?:unknown};
 if(v.format!=='vehicle-connectors-prototype-v1'||v.walkingRevision!==expected.walkingRevision||v.vehicleRevision!==expected.vehicleRevision||
  !Number.isSafeInteger(expected.walkingNodes)||expected.walkingNodes<0||!Number.isSafeInteger(expected.vehicleNodes)||expected.vehicleNodes<0||
  !Array.isArray(v.pairs)||v.pairs.length>expected.walkingNodes)throw Error('Incompatible vehicle connectors');
 const result=new Map<number,number[]>();let last=-1;
 for(const pair of v.pairs){if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||!Number.isInteger(pair[1])||
   pair[0]<=last||pair[0]>=expected.walkingNodes||pair[1]<0||pair[1]>=expected.vehicleNodes)throw Error('Invalid vehicle connector pair');
  last=pair[0];result.set(pair[0],[pair[1]]);
 }
 return result;
}
