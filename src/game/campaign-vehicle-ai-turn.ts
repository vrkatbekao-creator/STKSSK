/** Opt-in AI turn prototype; default campaign phase and Store do not use it yet. */
import type {Campaign,Team} from './campaign.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import type {CampaignVehicleState} from './campaign-vehicle-state.ts';
import {automatedFactionTurn,campaignCommand} from './campaign.ts';
import {vehicleActive} from './campaign-vehicle-state.ts';
import {chooseAiVehicleStop} from './campaign-vehicle-ai.ts';
import {previewCampaignVehicleLeg} from './campaign-vehicle-plans.ts';
import {executeCampaignDrive} from './campaign-vehicle-drive.ts';
import {executeCampaignMotorcade} from './campaign-vehicle-motorcade.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import type {CoverageFragment} from './campaign-motorcade.ts';
import {aiRosterGoal,recruitCost} from './campaign-growth.ts';

/** At most one drive+visit before the existing AI actions; all fees use player rules. */
export function automatedVehicleFactionTurn(original:Campaign,vehicle:CampaignVehicleState,team:Team,
 context:VehiclePlanContext,options:{recruit?:boolean;expertDialogue?:boolean;motorcade?:boolean;fragmentsForRoute?:(plan:VehicleLegPlan)=>readonly CoverageFragment[]}={}){
 if(!vehicleActive(vehicle,original.day))return {game:automatedFactionTurn(original,team,options),vehicle};
 const actor=original.units.find(u=>u.id===`${team}1`&&u.team===team),faction=vehicle.teams[team];
 if(!actor||!faction||faction.history.baseline===null||faction.journal.ledger.day!==original.day)return {game:original,vehicle,error:'c_errorRoute'};
 let game=original,nextVehicle=vehicle;
 const mode=options.motorcade&&options.fragmentsForRoute?'motorcade':'drive';
 const count=original.units.filter(u=>u.team===team).length;
 const recruitmentReserve=options.recruit!==false&&count<aiRosterGoal(original,team)?recruitCost(original,team).materials:0;
 const choice=chooseAiVehicleStop(original,actor,(cell,reserve)=>previewCampaignVehicleLeg(original,actor,cell,mode,
  faction.journal.ledger,context,{ap:reserve.ap,materials:reserve.materials+recruitmentReserve}),1);
 if(choice){
  const trip=mode==='motorcade'?executeCampaignMotorcade(original,team,actor.id,choice.cellId,faction.journal.ledger,faction.exposure,context,options.fragmentsForRoute!,{ap:2,materials:1+recruitmentReserve}):
   executeCampaignDrive(original,team,actor.id,choice.cellId,faction.journal.ledger,context,{ap:2,materials:1+recruitmentReserve});
  if('journey' in trip&&trip.journey){const exposure='exposure' in trip?trip.exposure:faction.exposure;
   const tentative={...vehicle,teams:{...vehicle.teams,[team]:{...faction,exposure,
    history:mode==='motorcade'?{...faction.history,events:[...faction.history.events,{kind:'motorcade' as const,day:original.day,phase:original.phase,journey:faction.journal.journeys.length}]}:faction.history,
    journal:{...faction.journal,ledger:trip.ledger,journeys:[...faction.journal.journeys,trip.journey]}}}};
   const action=campaignCommand({...trip.game,vehicle:tentative},{type:'canvass',unitId:actor.id,nodeId:choice.nodeId},team);
   if(!action.error){nextVehicle=action.game.vehicle??tentative;
    if(original.vehicle)game={...action.game,vehicle:nextVehicle};else{const {vehicle:_,...withoutVehicle}=action.game;game=withoutVehicle;}}
  }
 }
 const final=automatedFactionTurn(game,team,{recruit:options.recruit,expertDialogue:options.expertDialogue,disableTransport:true});
 return {game:final,vehicle:final.vehicle??nextVehicle};
}
