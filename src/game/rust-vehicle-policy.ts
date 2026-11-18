import type {VehicleGraphColumns} from './vehicle-graph-format.ts';
import {projectVehiclePoint,vehiclePointDistrict} from './vehicle-geometry.ts';
import type {CoverageDistrict} from './vehicle-geometry.ts';
import {vehicleTurnPolicy} from './vehicle-turn-policy.ts';
import type {parseVehicleTurnMetadata} from './vehicle-runtime-factory.ts';

export const preparedVehiclePolicy={
 filename:'vehicle-policy-v1.bin.gz',
 bytes:497449,
 sha256:'0794d988dcfad645634b6e0e01e73970f3b13940cfdb33b253adfa55b2951a5f',
};

export function encodeVehiclePolicy(graph:VehicleGraphColumns,turns:ReturnType<typeof parseVehicleTurnMetadata>,districts:readonly CoverageDistrict[]){
 const allow=vehicleTurnPolicy(turns.relations,turns.viaNodes);
 const incomingByNode=new Map<number,Map<bigint,number>>();
 for(let edge=0;edge<graph.targets.length;edge++){
  const way=graph.ways[edge];
  if(!allow.restrictedWays.has(way))continue;
  const node=graph.targets[edge];
  let incoming=incomingByNode.get(node);
  if(!incoming){incoming=new Map();incomingByNode.set(node,incoming);}
  if(!incoming.has(way))incoming.set(way,edge);
 }
 const forbidden:number[]=[];
 for(const [node,incoming] of incomingByNode)for(const [way,edge] of incoming){
  for(let outgoing=graph.offsets[node];outgoing<graph.offsets[node+1];outgoing++){
   if(!allow(way,graph.ids[node],graph.ways[outgoing]))forbidden.push(edge,outgoing);
  }
 }
 const districtCodes=new Map(districts.map((district,index)=>[district.id,index+1]));
 if(districtCodes.size!==districts.length||districts.length>255)throw Error('Invalid vehicle policy districts');
 const bounds=districts.map(district=>{
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const ring of district.rings)for(const [x,y] of ring){
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return {district,left,top,right,bottom};
 });
 const bytes=new ArrayBuffer(12+forbidden.length*4+graph.ids.length), view=new DataView(bytes);
 view.setUint32(0,0x31505652,true); // RVP1
 view.setUint32(4,graph.ids.length,true);
 view.setUint32(8,forbidden.length/2,true);
 forbidden.forEach((value,index)=>view.setUint32(12+index*4,value,true));
 const nodeDistricts=new Uint8Array(bytes,12+forbidden.length*4);
 for(let node=0;node<graph.ids.length;node++){
  const lon=graph.longitudes[node],lat=graph.latitudes[node];
  if(lon<120||lon>123||lat<21.5||lat>27)continue;
  const point=projectVehiclePoint(lon,lat),[x,y]=point;
  // Match the boundary tolerance and district tie-break of the reference policy.
  const possible=bounds.filter(b=>x>=b.left-.001&&x<=b.right+.001&&y>=b.top-.001&&y<=b.bottom+.001);
  if(possible.length)nodeDistricts[node]=districtCodes.get(vehiclePointDistrict(point,possible.map(b=>b.district))??'')??0;
 }
 return {bytes,districtCodes,forbiddenCount:forbidden.length/2};
}
