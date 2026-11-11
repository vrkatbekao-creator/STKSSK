import { create } from 'zustand';
import { initialCampaign,campaignCommand,endCampaignPhase,prioritizeWonder,chooseCommander } from './campaign.ts';
import type { CommanderId } from './campaign-tactics.ts';
import type { Command,Team } from './campaign.ts';
import { teams } from './campaign-teams.ts';
import { mapFor, allCells as cells,districts,nodeById } from './campaign-map.ts';
import { readSave,writeSave,SAVE_SLOTS,isSaveSlot } from './campaign-save.ts';
import type { Session,SaveError,StoragePort,SaveSlot } from './campaign-save.ts';
import type {VehicleSaveContext,VehicleSession} from './campaign-vehicle-save.ts';
import type {VehicleRuntime,VehicleCommand} from './campaign-vehicle-runtime.ts';
import {campaignVehicleCommand} from './campaign-vehicle-runtime.ts';
import {endVehicleCampaignPhase} from './campaign-vehicle-phase.ts';
import {initialVehicleState} from './campaign-vehicle-state.ts';
import {readVehicleSlot,writeVehicleSlot} from './campaign-vehicle-slots.ts';
type StoreSave={session:Session;savedAt:string};
type LoadedSave={save:StoreSave|null;error:SaveError|null;exists:boolean};
export type SlotSummary={slot:SaveSlot;exists:boolean;error:SaveError|null;campaign:{team:Team;day:number;phase:'day'|'night';finished:boolean;savedAt:string}|null};
const summary=(slot:SaveSlot,out:LoadedSave):SlotSummary=>({slot,exists:out.exists,error:out.error,campaign:out.save?{team:out.save.session.game.playerTeam,day:out.save.session.game.day,phase:out.save.session.game.phase,finished:!!out.save.session.game.result,savedAt:out.save.savedAt}:null});
export type Store=Session&{saveSlot:SaveSlot;slots:SlotSummary[];chooseSlot:(slot:SaveSlot)=>void;started:boolean;error:string|null;saved:StoreSave|null;saveExists:boolean;saveError:SaveError|null;start:(overwrite?:boolean)=>void;reset:()=>void;faction:(team:Team)=>void;commander:(id:CommanderId)=>void;select:(id:string)=>void;focus:(id:string)=>void;viewCity:()=>void;dispatch:(cmd:Command)=>void;vehicleDispatch:(cmd:VehicleCommand)=>void;end:()=>void;priority:(id:string)=>void;save:()=>void;resume:()=>void;menu:()=>void};
const fresh=(team:Team='blue',movementProfile:'legacy-hex'|'streets-v2'='legacy-hex'):Session=>{const game=initialCampaign(Math.floor(Math.random()*0x100000000),team,movementProfile);const selected=`${team}1`;return {game,selected,districtId:cells.get(game.units.find(u=>u.id===selected)!.cellId)!.districtId,view:'city'};};
export function createCampaignStore(storage:StoragePort|null,movementProfile:'legacy-hex'|'streets-v2'='legacy-hex',vehicle?:{runtime:VehicleRuntime;saveContext:VehicleSaveContext}){
 if(vehicle&&vehicle.runtime.revision!==vehicle.saveContext.revision)throw Error('Incompatible vehicle runtime');
 const makeFresh=(team:Team='blue')=>{const session=fresh(team,movementProfile);return vehicle?{...session,game:{...session.game,vehicle:initialVehicleState(session.game,vehicle.runtime.revision,'new')}}:session;};
 const readSlot=(slot:SaveSlot):LoadedSave=>{if(!vehicle)return readSave(storage,slot);const out=readVehicleSlot(storage,slot,vehicle.saveContext);return {save:out.session&&out.savedAt?{session:out.session,savedAt:out.savedAt}:null,error:out.error,exists:out.exists};};
 const loaded=readSlot(1);const initialSlots=SAVE_SLOTS.map(slot=>summary(slot,slot===1?loaded:readSlot(slot)));
 return create<Store>((set,get)=>{
  const persist=()=>{const {game,selected,districtId,view}=get(),session={game,selected,districtId,view},slot=get().saveSlot;
   const result=vehicle?writeVehicleSlot(storage,slot,session as VehicleSession,vehicle.saveContext):writeSave(storage,session,slot);
   const saved=vehicle?('savedAt' in result&&result.savedAt?{session,savedAt:result.savedAt}:null):('save' in result?result.save:null);
   if(saved){set({saved,saveExists:true,saveError:null,slots:get().slots.map(s=>s.slot===slot?summary(slot,{save:saved,error:null,exists:true}):s)});}else set({saveError:result.error});return !!saved;};
  return {
   ...makeFresh(),saveSlot:1,slots:initialSlots,started:false,error:null,saved:loaded.save,saveExists:loaded.exists,saveError:loaded.error,
   chooseSlot:slot=>{if(get().started||!isSaveSlot(slot))return;const out=readSlot(slot);set({saveSlot:slot,saved:out.save,saveExists:out.exists,saveError:out.error,error:null,slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});},
   start:(overwrite=false)=>{if(get().started)return;const slot=get().saveSlot,out=readSlot(slot);set({saved:out.save,saveExists:out.exists,slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});if(out.exists&&!overwrite){set({saveError:out.error,error:'s_confirmOverwrite'});return;}set({started:true,error:null});persist();},
   reset:()=>set({...makeFresh(get().game.playerTeam),started:false,error:null}),
   faction:team=>{const g=get().game;if(get().started||!teams.includes(team))return;const selected=`${team}1`;set({game:{...g,playerTeam:team},selected,districtId:cells.get(g.units.find(u=>u.id===selected)!.cellId)!.districtId,error:null});},
   commander:id=>{if(!get().started)set({game:chooseCommander(get().game,id),error:null});},
   select:id=>{const s=get(),u=s.game.units.find(u=>u.id===id&&u.team===s.game.playerTeam);if(u){set({selected:id,districtId:cells.get(u.cellId)!.districtId,error:null});if(s.started)persist();}},
   focus:id=>{if(districts.some(d=>d.id===id)){set({districtId:id,view:'street',error:null});if(get().started)persist();}},
   viewCity:()=>{set({view:'city',error:null});if(get().started)persist();},
   dispatch:cmd=>{if(!get().started)return;const out=campaignCommand(get().game,cmd);set({game:out.game,error:out.error??null});if(!out.error){if(cmd.type==='transport'||cmd.type==='move'||cmd.type==='siteTransfer'){const unit=out.game.units.find(u=>u.id===cmd.unitId)!;set({districtId:cells.get(unit.cellId)!.districtId,view:'street'});}if(cmd.type==='canvassRoute')set({districtId:mapFor(out.game).nodeById.get(cmd.nodeId)!.districtId,view:'street'});persist();}},
   vehicleDispatch:cmd=>{if(!get().started||!vehicle)return;const game=get().game,out=campaignVehicleCommand(game,game.playerTeam,cmd,vehicle.runtime);set({game:out.game,error:out.error??null});if(!out.error){const unit=out.game.units.find(u=>u.id===cmd.unitId)!;set({districtId:cells.get(unit.cellId)!.districtId,view:'street'});persist();}},
   end:()=>{if(!get().started||get().game.result)return;if(get().game.talk){set({error:'d_finishFirst'});return;}const game=get().game;
    const next=vehicle&&game.vehicle?endVehicleCampaignPhase(game,game.vehicle,vehicle.runtime.contextFor,{fragmentsForRoute:vehicle.runtime.fragmentsForRoute}).game:endCampaignPhase(game);
    set({game:next,error:null});persist();},
   priority:id=>{if(!get().started)return;set({game:prioritizeWonder(get().game,id)});persist();},
   save:()=>{if(get().started)persist();},
   resume:()=>{const slot=get().saveSlot,out=readSlot(slot);set({slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});if(out.save)set({...structuredClone(out.save.session),saved:out.save,saveExists:true,saveError:null,started:true,error:null});else set({saved:null,saveExists:out.exists,saveError:out.error??'c_saveInvalid'});},
   menu:()=>{if(!get().started)return;if(persist())set({...makeFresh(get().game.playerTeam),started:false,error:null});},
  };
 });
}
function browserStorage(){try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export const useCampaign=createCampaignStore(browserStorage(),'streets-v2');
