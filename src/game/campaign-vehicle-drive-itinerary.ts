/** Transactional drive-only itinerary prototype, not wired to the store or save schema. */
import type {Campaign,Team} from './campaign.ts';
import type {VehiclePlanContext} from './campaign-vehicle-plans.ts';
import type {VehicleTeamLedger} from './vehicle-ledger.ts';
import type {ItineraryStop} from './campaign-vehicle-itinerary.ts';
import type {VehicleLegPlan} from './vehicle-leg-planner.ts';
import type {VehicleJourney} from './vehicle-journal.ts';
import {simulateVehicleItinerary} from './campaign-vehicle-itinerary.ts';
import {executeCampaignDrive} from './campaign-vehicle-drive.ts';

/** Both campaign and ledger roll back together if any stop or activity fails. */
export function simulateDriveItinerary(original:Campaign,originalLedger:VehicleTeamLedger,team:Team,
 unitId:string,stops:readonly ItineraryStop[],context:VehiclePlanContext){
 let ledger=structuredClone(originalLedger);const plans:VehicleLegPlan[]=[],journeys:VehicleJourney[]=[];
 const outcome=simulateVehicleItinerary(original,team,unitId,stops,(game,leg,actorTeam)=>{
  if(leg.mode!=='drive')return {game,error:'c_errorRoute'};
  const result=executeCampaignDrive(game,actorTeam,leg.unitId,leg.cellId,ledger,context);
  if(result.error||!result.plan||!result.journey)return {game,error:result.error??'c_errorRoute'};
  ledger=result.ledger;plans.push(result.plan);journeys.push(result.journey);return {game:result.game};
 });
 if(outcome.error)return {game:original,ledger:originalLedger,error:outcome.error,failedStop:outcome.failedStop};
 return {game:outcome.game,ledger,plans,journeys};
}
