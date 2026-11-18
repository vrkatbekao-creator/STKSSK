/** Pure drive executor prototype. Not exposed through campaignCommand or saves yet. */
import type {Campaign,Team} from './campaign.ts';
import type {VehicleTeamLedger} from './vehicle-ledger.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import {previewCampaignVehicleLeg} from './campaign-vehicle-plans.ts';
import {applyVehicleCharge} from './vehicle-ledger.ts';
import {copyCampaign} from './campaign-copy.ts';
import {career,exert} from './campaign-growth.ts';
import {recordArrival,ensureTrail} from './campaign-progress.ts';
import {boardingWalkCharge} from './vehicle-cost.ts';
import {vehicleEdgeQuarterMetres} from './vehicle-routing.ts';
import type {VehicleJourney} from './vehicle-journal.ts';
import type {VehicleMode} from './vehicle-cost.ts';

/** Caller authenticates the graph context; all effects are returned on copies. */
export function executeCampaignVehicle(original:Campaign,team:Team,unitId:string,destinationCell:string,
 ledger:VehicleTeamLedger,context:VehiclePlanContext,mode:VehicleMode,reserve={ap:0,materials:0}){
 const actor=original.units.find(u=>u.id===unitId&&u.team===team);
 if(!actor)return {game:original,ledger,error:'c_errorUnit'};
 const plan=previewCampaignVehicleLeg(original,actor,destinationCell,mode,ledger,context,reserve);
 if(!plan)return {game:original,ledger,error:'c_errorRoute'};
 const weights=plan.edgeIndices.map(edge=>context.edgeWeightQuarters(edge));
 if(weights.some(w=>!Number.isInteger(w)||w<4||w>7)||weights.reduce((sum,w,i)=>sum+Math.ceil(vehicleEdgeQuarterMetres(context.graph.metres[plan.edgeIndices[i]])*w/4),0)!==plan.weightedQuarterMetres)
  return {game:original,ledger,error:'c_errorRoute'};
 const state=copyCampaign(original),unit=state.units.find(u=>u.id===unitId&&u.team===team)!;
 const condition=career(unit),resources=state.resources[team];
 const charged=applyVehicleCharge(ledger,{ap:unit.ap,materials:resources.materials,fatigue:unit.fatigue,health:condition.health},
  {unitId,mode,actualQuarterMetres:plan.actualQuarterMetres,weightedQuarterMetres:plan.weightedQuarterMetres});
 if(!charged.ok||charged.resources.ap<plan.walkingAp)return {game:original,ledger,error:charged.ok?'c_errorAP':charged.reason==='materials'?'c_errorMaterials':'c_errorAP'};
 unit.ap=charged.resources.ap-plan.walkingAp;unit.fatigue=charged.resources.fatigue;condition.health=charged.resources.health;unit.career=condition;
 resources.materials=charged.resources.materials;
 // Boarding and alighting share the daily walking pool; curbside hops under 300m cost 0 AP and add no strain.
 let walked=unit.walkedEffort??0,credit=unit.walkCredit??0;
 for(const walk of [plan.boarding,plan.alighting]){
  const step=boardingWalkCharge(walk.effort,walk.edgeIds.length>0,walked,credit);
  if(walk.edgeIds.length&&!step.curbside)exert(state,unit,'move',Math.max(1,step.ap));
  walked=step.walked;credit=step.credit;
 }
 unit.walkedEffort=Math.round(walked*100)/100;unit.walkCredit=Math.round(credit*100)/100;
 if(mode==='motorcade')unit.motorcadeComboCell=destinationCell;else delete unit.motorcadeComboCell;
 unit.cellId=destinationCell;ensureTrail(state);recordArrival(state,team,[destinationCell]);state.actions++;
 state.logs=[{key:'c_logAction',values:{team,unit:unitId,action:mode}},...state.logs].slice(0,100);
 const journey:VehicleJourney={day:original.day,phase:original.phase,unitId,mode,fromCell:actor.cellId,toCell:destinationCell,
  boardEdges:[...plan.boarding.edgeIds],carStart:plan.nodeIndices[0],carEdges:[...plan.edgeIndices],weights,
  alightStart:plan.alighting.walkingNode,alightEdges:[...plan.alighting.edgeIds],actualQuarterMetres:plan.actualQuarterMetres,
  weightedQuarterMetres:plan.weightedQuarterMetres};
 return {game:state,ledger:charged.ledger,plan,journey};
}
export function executeCampaignDrive(original:Campaign,team:Team,unitId:string,destinationCell:string,
 ledger:VehicleTeamLedger,context:VehiclePlanContext,reserve={ap:0,materials:0}){
 return executeCampaignVehicle(original,team,unitId,destinationCell,ledger,context,'drive',reserve);
}
