/** Opt-in AI phase prototype, not connected to the single campaign Store yet. */
import type {Campaign,Team} from './campaign.ts';
import type {CampaignVehicleState} from './campaign-vehicle-state.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import type {CoverageFragment} from './campaign-motorcade.ts';
import {endCampaignPhase} from './campaign.ts';
import {teams} from './campaign-teams.ts';
import {advanceVehicleState} from './campaign-vehicle-state.ts';
import {automatedVehicleFactionTurn} from './campaign-vehicle-ai-turn.ts';

/** Run opponents in the standard order and advance vehicle ledgers only at morning. */
export function endVehicleCampaignPhase(original:Campaign,vehicle:CampaignVehicleState,
 contextFor:(game:Campaign,team:Team)=>VehiclePlanContext,
 options:{fragmentsForRoute?:(game:Campaign,team:Team,plan:VehicleLegPlan)=>readonly CoverageFragment[]}={}){
 let current=vehicle;
 const game=endCampaignPhase(original,{automatedTurn:(g,team)=>{
  const input=original.vehicle?{...g,vehicle:current}:g;
  const motorcade=!!options.fragmentsForRoute&&(g.day+teams.indexOf(team))%2===0;
  const result=automatedVehicleFactionTurn(input,current,team,contextFor(input,team),{motorcade,
   ...(options.fragmentsForRoute?{fragmentsForRoute:(plan:VehicleLegPlan)=>options.fragmentsForRoute!(input,team,plan)}:{})});
  if(result.error)throw Error(result.error);
  current=result.vehicle;return original.vehicle?{...result.game,vehicle:current}:result.game;
 }});
 if(game.day!==original.day)current=advanceVehicleState(current,game.day,game);
 return {game:original.vehicle?{...game,vehicle:current}:game,vehicle:current};
}
