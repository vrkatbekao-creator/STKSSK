/** Vehicle-state migration helpers. Not yet attached to campaign-save or the Store. */
import type {Campaign,Team} from './campaign.ts';
import {teams,teamRecord} from './campaign-teams.ts';
import type {VehicleJournal} from './vehicle-journal.ts';
import type {MotorcadeLedger} from './campaign-motorcade.ts';
import {newVehicleLedger,vehicleLedgerForDay} from './vehicle-ledger.ts';
import {newMotorcadeLedger,motorcadeLedgerForDay} from './campaign-motorcade.ts';

export type FootHeat=Record<string,{day:number;heat:number}>;
export type ExposureEvent={kind:'foot';day:number;phase:'day'|'night';cellId:string}|{kind:'motorcade';day:number;phase:'day'|'night';journey:number};
export type ExposureHistory={baseline:FootHeat|null;events:ExposureEvent[]};
export type VehicleFactionState={journal:VehicleJournal;exposure:MotorcadeLedger;history:ExposureHistory};
export type CampaignVehicleState={revision:string;activationDay:number|null;teams:Record<Team,VehicleFactionState>};

/** Old road games activate next morning; day 28 and historical hex games never switch. */
export function initialVehicleState(g:Campaign,revision:string,source:'new'|'migrated'):CampaignVehicleState{
 if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision)||!Number.isInteger(g.day)||g.day<1||g.day>28||!['new','migrated'].includes(source)||source==='new'&&g.day!==1)throw new RangeError('Invalid vehicle migration');
 const activationDay=g.movementProfile!=='streets-v2'?null:source==='new'?1:g.day<28?g.day+1:null;
 return {revision,activationDay,teams:teamRecord(team=>({journal:{revision,ledger:newVehicleLedger(g.day,team),journeys:[]},exposure:newMotorcadeLedger(g.day,team),
  history:{baseline:activationDay===1?structuredClone(g.outreach?.[team].sectors??{}):null,events:[]}}))};
}
export function vehicleActive(state:CampaignVehicleState,day:number){return state.activationDay!==null&&day>=state.activationDay;}

/** The caller controls the game clock; this changes only vehicle daily accounting. */
export function advanceVehicleState(state:CampaignVehicleState,day:number,game?:Campaign):CampaignVehicleState{
 return {...state,teams:Object.fromEntries(teams.map(team=>{const current=state.teams[team];return [team,{journal:{...current.journal,
  ledger:vehicleLedgerForDay(current.journal.ledger,day)},exposure:motorcadeLedgerForDay(current.exposure,day),
  history:current.history.baseline===null&&state.activationDay===day&&game?{...current.history,baseline:structuredClone(game.outreach?.[team].sectors??{})}:current.history}];})) as Record<Team,VehicleFactionState>};
}
