/** Motorcade execution prototype; requires trusted source-road/sector fragments. */
import type {Campaign,Team} from './campaign.ts';
import type {VehicleTeamLedger} from './vehicle-ledger.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import type {CoverageFragment,MotorcadeLedger} from './campaign-motorcade.ts';
import {applyMotorcadeExposure,creditMotorcadeContacts} from './campaign-motorcade.ts';
import {executeCampaignVehicle} from './campaign-vehicle-drive.ts';
import {grantXP} from './campaign-growth.ts';

/** No UI/store integration: the fragment producer must validate the exact graph revision. */
export function executeCampaignMotorcade(original:Campaign,team:Team,unitId:string,destinationCell:string,
 ledger:VehicleTeamLedger,exposure:MotorcadeLedger,context:VehiclePlanContext,
 fragmentsForRoute:(plan:VehicleLegPlan)=>readonly CoverageFragment[],reserve={ap:0,materials:0}){
 if(exposure.day!==original.day||exposure.team!==team)return {game:original,ledger,exposure,error:'c_errorRoute'};
 const movement=executeCampaignVehicle(original,team,unitId,destinationCell,ledger,context,'motorcade',reserve);
 if(movement.error||!movement.plan||!movement.journey)return {game:original,ledger,exposure,error:movement.error??'c_errorRoute'};
 try{
  const fragments=fragmentsForRoute(movement.plan);
  if(!Array.isArray(fragments))return {game:original,ledger,exposure,error:'c_errorRoute'};
  const length=fragments.reduce((sum,p)=>sum+p.end-p.start,0);
  if(!Number.isSafeInteger(length)||length<0||length>movement.plan.actualQuarterMetres)return {game:original,ledger,exposure,error:'c_errorRoute'};
  const footHeat=(sector:string)=>{const entry=original.outreach?.[team].sectors[sector];return entry?Math.max(0,entry.heat-Math.floor((original.day-entry.day)/2)):0;};
  const result=applyMotorcadeExposure(exposure,fragments,footHeat);
  for(const [district,points] of Object.entries(result.awards)){
   if(!movement.game.support[district])return {game:original,ledger,exposure,error:'c_errorRoute'};
   movement.game.support[district][team]+=points;
  }
  const credit=creditMotorcadeContacts(result.ledger,unitId,result.newlyReached);
  const actor=movement.game.units.find(u=>u.id===unitId&&u.team===team)!;
  if(credit.xp)grantXP(movement.game,actor,credit.xp);
  return {...movement,exposure:credit.ledger,contacts:result.newlyReached};
 }catch{return {game:original,ledger,exposure,error:'c_errorRoute'};}
}
