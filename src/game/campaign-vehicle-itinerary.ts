/** Atomic multi-stop simulation; vehicle executor is deliberately not wired yet. */
import {campaignCommand} from './campaign.ts';
import type {Campaign,Command,Team} from './campaign.ts';
import type {VehicleMode} from './vehicle-cost.ts';

export type VehicleLeg={unitId:string;mode:VehicleMode;cellId:string};
export type ItineraryAction=Extract<Command,{type:'streetCanvass'|'canvass'|'visit'|'forum'|'livestream'|'culture'|'environment'|'talkStart'}>;
export type ItineraryStop={travel:VehicleLeg;action?:ItineraryAction};
export type VehicleExecutor=(state:Campaign,leg:VehicleLeg,team:Team)=>{game:Campaign;error?:string};

/** Always works on a clone; callers must re-run against current state when confirming. */
export function simulateVehicleItinerary(original:Campaign,team:Team,unitId:string,stops:readonly ItineraryStop[],executeVehicle:VehicleExecutor):
  {game:Campaign;error?:string;failedStop?:number}{
 if(original.result)return {game:original,error:'c_errorEnded'};
 if(original.talk)return {game:original,error:'d_finishFirst'};
 if(!Array.isArray(stops)||stops.length<1||stops.length>6||!original.units.some(u=>u.id===unitId&&u.team===team))return {game:original,error:'c_errorRoute'};
 let state=structuredClone(original);
 for(let i=0;i<stops.length;i++){
  const stop=stops[i],leg=stop?.travel;
  if(!leg||leg.unitId!==unitId||!['drive','motorcade'].includes(leg.mode)||typeof leg.cellId!=='string'||
     (stop.action&&(stop.action.unitId!==unitId||!['streetCanvass','canvass','visit','forum','livestream','culture','environment','talkStart'].includes(stop.action.type))))return {game:original,error:'c_errorRoute',failedStop:i};
  const travel=executeVehicle(state,leg,team);
  if(travel.error)return {game:original,error:travel.error,failedStop:i};
  state=travel.game;
  if(state.talk)return {game:original,error:'d_finishFirst',failedStop:i};
  if(stop.action){const action=campaignCommand(state,stop.action,team);if(action.error)return {game:original,error:action.error,failedStop:i};state=action.game;}
  if(state.talk&&i<stops.length-1)return {game:original,error:'d_finishFirst',failedStop:i};
 }
 return {game:state};
}
