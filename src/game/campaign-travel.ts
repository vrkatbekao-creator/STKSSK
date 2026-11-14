import { campaignCommand, interactionCells, route, transportDestination, siteTransferDestination } from './campaign.ts';
import type { Campaign, CampaignUnit } from './campaign.ts';
import { allCells, cellPosition, mapFor, routingEdges } from './campaign-map.ts';
import { campaignVehicleCommand } from './campaign-vehicle-runtime.ts';
import type { VehicleRuntime } from './campaign-vehicle-runtime.ts';
import { projectVehiclePoint } from './vehicle-geometry.ts';
import type {VehicleGraphColumns} from './vehicle-graph-format.ts';
import type {VehicleJourney} from './vehicle-journal.ts';

export type TravelMode='walk'|'drive'|'motorcade'|'siteTransfer'|'transport';
export type TravelIntent={unitId:string;cellId:string;nodeId?:string;districtId?:string;mode:TravelMode};
export type TravelSegment={mode:'walk'|'drive'|'motorcade'|'transfer';points:number[][]};
export type TravelQuote={destination:string;ap:number;materials:number;remaining:number;segments:TravelSegment[];
 walkingAp?:number;vehicleAp?:number;contacts?:number};
type TravelResult={game:Campaign;quote?:TravelQuote;error?:string};

function walked(edges:Iterable<number>):number[][] {
 return Array.from(edges).flatMap((edge,i)=>i?routingEdges[edge].points.slice(1):routingEdges[edge].points);
}
export function savedVehicleSegments(graph:VehicleGraphColumns,trip:VehicleJourney):TravelSegment[]{
 const nodes=[trip.carStart,...trip.carEdges.map(edge=>graph.targets[edge])];
 const segments:TravelSegment[]=[
  {mode:'walk',points:walked(trip.boardEdges)},
  {mode:trip.mode,points:nodes.map(i=>projectVehiclePoint(graph.longitudes[i],graph.latitudes[i]))},
  {mode:'walk',points:walked(trip.alightEdges)},
 ];
 return segments.filter(s=>s.points.length>1);
}

/** Run the authoritative command against an immutable snapshot. Only the Store can commit this result. */
export function prepareCampaignTravel(game:Campaign,intent:TravelIntent,runtime?:VehicleRuntime,
 routeEdges?:(unit:CampaignUnit,cellId:string)=>Uint32Array|null):TravelResult {
 const unit=game.units.find(u=>u.id===intent.unitId&&u.team===game.playerTeam);
 const map=mapFor(game);
 if(!unit||!map.cells.has(intent.cellId))return {game,error:'c_errorRoute'};
 const node=intent.nodeId?map.nodeById.get(intent.nodeId):undefined;
 if(intent.nodeId&&(!node||node.cellId!==intent.cellId))return {game,error:'c_errorRoute'};
 const candidates=node?interactionCells(game,node):[intent.cellId];
 const mode=intent.mode;
 const finish=(next:Campaign,segments:TravelSegment[],extra:Partial<TravelQuote>={}):TravelResult=>{
  const after=next.units.find(u=>u.id===unit.id)!;
  return {game:next,quote:{destination:after.cellId,ap:unit.ap-after.ap,remaining:after.ap,
   materials:game.resources[unit.team].materials-next.resources[unit.team].materials,segments,...extra}};
 };
 if(mode==='drive'||mode==='motorcade'){
  if(!runtime)return {game,error:'c_vehicleUnavailable'};
  for(const cellId of candidates){
   if(cellId===unit.cellId)continue;
   const out=campaignVehicleCommand(game,unit.team,{unitId:unit.id,mode,cellId},runtime);
   if(out.error||!out.plan)continue;
   const plan=out.plan,{graph}=runtime.contextFor(game,unit.team);
   const trip=out.game.vehicle!.teams[unit.team].journal.journeys.at(-1)!;
   return finish(out.game,savedVehicleSegments(graph,trip),{walkingAp:plan.walkingAp,vehicleAp:plan.vehicleAp,contacts:'contacts' in out?out.contacts:undefined});
  }
 }else if(mode==='walk'){
  for(const cellId of candidates){
   if(cellId===unit.cellId)continue;
   const edges=routeEdges?.(unit,cellId);
   const path=routeEdges?null:route(game,unit,cellId);
   if(routeEdges?!edges?.length:!path)continue;
   const out=campaignCommand(game,{type:'move',unitId:unit.id,cellId},unit.team,edges??undefined);
   if(!out.error)return finish(out.game,[{mode,points:edges?walked(edges):path!.geometry}]);
  }
 }else{
  const cmd=mode==='siteTransfer'&&node?{type:mode,unitId:unit.id,nodeId:node.id} as const:
   mode==='transport'&&intent.districtId?{type:mode,unitId:unit.id,districtId:intent.districtId} as const:null;
  if(!cmd)return {game,error:'c_errorRoute'};
  const dest=cmd.type==='siteTransfer'?siteTransferDestination(game,unit,cmd.nodeId):transportDestination(game,unit,cmd.districtId);
  if(dest){
   const out=campaignCommand(game,cmd,unit.team);
   if(!out.error)return finish(out.game,[{mode:'transfer',points:[cellPosition(allCells.get(unit.cellId)!),cellPosition(dest)]}]);
   return {game,error:out.error};
  }
 }
 return {game,error:'c_errorRoute'};
}
