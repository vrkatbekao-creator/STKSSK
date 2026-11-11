/** Backend-only vehicle command. Store/UI wiring and trusted asset loading remain pending. */
import type {Campaign,Team} from './campaign.ts';
import type {VehicleMode} from './vehicle-cost.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import type {CoverageFragment} from './campaign-motorcade.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import {executeCampaignDrive} from './campaign-vehicle-drive.ts';
import {executeCampaignMotorcade} from './campaign-vehicle-motorcade.ts';
import {vehicleActive} from './campaign-vehicle-state.ts';

export type VehicleRuntime={revision:string;contextFor:(game:Campaign,team:Team)=>VehiclePlanContext;
 /** The caller must use authenticated sector fragments for this exact route and revision. */
 fragmentsForRoute:(game:Campaign,team:Team,plan:VehicleLegPlan)=>readonly CoverageFragment[]};
export type VehicleCommand={unitId:string;mode:VehicleMode;cellId:string};

/** Same game state contains histories, budgets and ordinary campaign state. */
export function campaignVehicleCommand(original:Campaign,team:Team,cmd:VehicleCommand,runtime:VehicleRuntime){
 const state=original.vehicle;
 if(!state||state.revision!==runtime.revision||!vehicleActive(state,original.day)||!['drive','motorcade'].includes(cmd.mode))return {game:original,error:'c_errorRoute'};
 const faction=state.teams[team];if(!faction||faction.history.baseline===null||faction.journal.ledger.day!==original.day||faction.exposure.day!==original.day)return {game:original,error:'c_errorRoute'};
 const context=runtime.contextFor(original,team);
 if(cmd.mode==='drive'){
  const result=executeCampaignDrive(original,team,cmd.unitId,cmd.cellId,faction.journal.ledger,context);
  if(result.error||!result.journey)return {game:original,error:result.error??'c_errorRoute'};
  const vehicle={...state,teams:{...state.teams,[team]:{...faction,journal:{...faction.journal,ledger:result.ledger,
   journeys:[...faction.journal.journeys,result.journey]}}}};
  return {game:{...result.game,vehicle},plan:result.plan};
 }
 const result=executeCampaignMotorcade(original,team,cmd.unitId,cmd.cellId,faction.journal.ledger,faction.exposure,context,
  plan=>runtime.fragmentsForRoute(original,team,plan));
 if(!('journey' in result)||!result.journey||!('plan' in result)||!result.plan)return {game:original,error:result.error??'c_errorRoute'};
 const vehicle={...state,teams:{...state.teams,[team]:{...faction,journal:{...faction.journal,ledger:result.ledger,
  journeys:[...faction.journal.journeys,result.journey]},exposure:result.exposure,
  history:{...faction.history,events:[...faction.history.events,{kind:'motorcade' as const,day:original.day,phase:original.phase,journey:faction.journal.journeys.length}]}}}};
 return {game:{...result.game,vehicle},plan:result.plan,contacts:result.contacts};
}
