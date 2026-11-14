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
import type {CampaignWasmRunner,RoadMovePlanner} from './rust-move-client.ts';
import {prepareCampaignTravel,savedVehicleSegments} from './campaign-travel.ts';
import type {TravelIntent,TravelQuote,TravelSegment} from './campaign-travel.ts';
import type {RustCampaignResult} from './rust-routing.ts';
type StoreSave={session:Session;savedAt:string};
type LoadedSave={save:StoreSave|null;error:SaveError|null;exists:boolean};
export type SlotSummary={slot:SaveSlot;exists:boolean;error:SaveError|null;campaign:{team:Team;day:number;phase:'day'|'night';finished:boolean;savedAt:string}|null};
const summary=(slot:SaveSlot,out:LoadedSave):SlotSummary=>({slot,exists:out.exists,error:out.error,campaign:out.save?{team:out.save.session.game.playerTeam,day:out.save.session.game.day,phase:out.save.session.game.phase,finished:!!out.save.session.game.result,savedAt:out.save.savedAt}:null});
export type Store=Session&{quoteTravel:(intent:TravelIntent)=>Promise<{quote?:TravelQuote;error?:string}>;confirmTravel:(quote:TravelQuote)=>boolean;
 vehicleHistoryRoute:(index:number)=>TravelSegment[];
 movePending:boolean;campaignPending:'vehicle'|'night'|null;vehicleUnavailable:boolean;lastMoveEngine:'wasm'|'typescript'|null;
 lastVehicleEngine:'wasm'|'typescript'|null;lastNightEngine:'wasm'|'typescript'|null;lastNightSearches:number;
 saveSlot:SaveSlot;slots:SlotSummary[];chooseSlot:(slot:SaveSlot)=>void;started:boolean;error:string|null;saved:StoreSave|null;saveExists:boolean;saveError:SaveError|null;start:(overwrite?:boolean)=>void;reset:()=>void;faction:(team:Team)=>void;commander:(id:CommanderId)=>void;select:(id:string)=>void;focus:(id:string)=>void;viewCity:()=>void;dispatch:(cmd:Command)=>void|Promise<void>;vehicleDispatch:(cmd:VehicleCommand)=>void|Promise<void>;end:()=>void|Promise<void>;priority:(id:string)=>void;save:()=>void;resume:()=>void;menu:()=>void};
const fresh=(team:Team='blue',movementProfile:'legacy-hex'|'streets-v2'='legacy-hex'):Session=>{const game=initialCampaign(Math.floor(Math.random()*0x100000000),team,movementProfile);const selected=`${team}1`;return {game,selected,districtId:cells.get(game.units.find(u=>u.id===selected)!.cellId)!.districtId,view:'city'};};
export function createCampaignStore(storage:StoragePort|null,movementProfile:'legacy-hex'|'streets-v2'='legacy-hex',vehicle?:{runtime:VehicleRuntime;saveContext:VehicleSaveContext},planRoadMove?:RoadMovePlanner,runWasm?:CampaignWasmRunner,vehicleUnavailable=false,
 travelWasm?:(game:Session['game'],intent:TravelIntent)=>Promise<RustCampaignResult>){
 if(vehicle&&vehicle.runtime.revision!==vehicle.saveContext.revision)throw Error('Incompatible vehicle runtime');
 const makeFresh=(team:Team='blue')=>{const session=fresh(team,movementProfile);return vehicle?{...session,game:{...session.game,vehicle:initialVehicleState(session.game,vehicle.runtime.revision,'new')}}:session;};
 const readSlot=(slot:SaveSlot):LoadedSave=>{if(!vehicle)return readSave(storage,slot);const out=readVehicleSlot(storage,slot,vehicle.saveContext);return {save:out.session&&out.savedAt?{session:out.session,savedAt:out.savedAt}:null,error:out.error,exists:out.exists};};
 const loaded=readSlot(1);const initialSlots=SAVE_SLOTS.map(slot=>summary(slot,slot===1?loaded:readSlot(slot)));
 return create<Store>((set,get)=>{
  const quotes=new WeakMap<TravelQuote,{game:Session['game'];next:Session['game'];slot:SaveSlot;unitId:string;wasm:boolean;mode:TravelIntent['mode']}>();
  const persist=()=>{const {game,selected,districtId,view}=get(),session={game,selected,districtId,view},slot=get().saveSlot;
   const result=vehicle?writeVehicleSlot(storage,slot,session as VehicleSession,vehicle.saveContext):writeSave(storage,session,slot);
   const saved=vehicle?('savedAt' in result&&result.savedAt?{session,savedAt:result.savedAt}:null):('save' in result?result.save:null);
   if(saved){set({saved,saveExists:true,saveError:null,slots:get().slots.map(s=>s.slot===slot?summary(slot,{save:saved,error:null,exists:true}):s)});}else set({saveError:result.error});return !!saved;};
  const commit=(cmd:Command,roadEdges?:Uint32Array)=>{
   const out=campaignCommand(get().game,cmd,undefined,roadEdges);
   if(out.error){set({error:out.error});return;}
   const unit='unitId' in cmd?out.game.units.find(u=>u.id===cmd.unitId):undefined;
   const districtId=(cmd.type==='transport'||cmd.type==='move'||cmd.type==='siteTransfer')&&unit
    ?cells.get(unit.cellId)!.districtId:cmd.type==='canvassRoute'?mapFor(out.game).nodeById.get(cmd.nodeId)!.districtId:undefined;
   set({game:out.game,error:null,...(districtId?{districtId,view:'street' as const}:{}),
    ...(cmd.type==='move'&&planRoadMove?{lastMoveEngine:roadEdges?'wasm' as const:'typescript' as const}:{})});
   persist();
  };
  const finish=(game:Session['game'],cmd?:VehicleCommand)=>cmd&&vehicle
   ?campaignVehicleCommand(game,game.playerTeam,cmd,vehicle.runtime)
   :{game:vehicle&&game.vehicle
     ?endVehicleCampaignPhase(game,game.vehicle,vehicle.runtime.contextFor,{fragmentsForRoute:vehicle.runtime.fragmentsForRoute}).game
     :endCampaignPhase(game)};
  const apply=(out:{game:Session['game'];error?:string},cmd:VehicleCommand|undefined,searches:number)=>{
   if(out.error){set({error:out.error});return;}
   const engine=searches?'wasm' as const:'typescript' as const;
   if(cmd)set({game:out.game,error:null,districtId:cells.get(cmd.cellId)!.districtId,view:'street',lastVehicleEngine:engine});
   else set({game:out.game,error:null,...(get().game.phase==='night'?{lastNightEngine:engine,lastNightSearches:searches}:{})});
   persist();
  };
  const run=(cmd?:VehicleCommand)=>{
   const {game,saveSlot,campaignPending}=get();
   if(campaignPending)return;
   if(!runWasm||game.movementProfile!=='streets-v2'||(!cmd&&game.phase==='day')){apply(finish(game,cmd),cmd,0);return;}
   set({campaignPending:cmd?'vehicle':'night',error:null,
    ...(cmd?{lastVehicleEngine:null}:{lastNightEngine:null,lastNightSearches:0})});
   return (async()=>{
    const current=()=>get().started&&get().game===game&&get().saveSlot===saveSlot;
    try{
     let out;
     try{out=await runWasm(game,cmd);}
     catch(error){
      if(import.meta.env?.DEV)console.warn('WASM campaign command failed',error);
      if(current())apply(finish(game,cmd),cmd,0);
      return;
     }
     if(current())apply(out,cmd,out.searches);
    }finally{set({campaignPending:null});}
   })();
  };
  return {
   ...makeFresh(),movePending:false,campaignPending:null,vehicleUnavailable,lastMoveEngine:null,lastVehicleEngine:null,lastNightEngine:null,lastNightSearches:0,
   saveSlot:1,slots:initialSlots,started:false,error:null,saved:loaded.save,saveExists:loaded.exists,saveError:loaded.error,
   vehicleHistoryRoute:index=>{
    const {game}=get(),trip=game.vehicle?.teams[game.playerTeam].journal.journeys[index];
    return vehicle&&trip?savedVehicleSegments(vehicle.runtime.contextFor(game,game.playerTeam).graph,trip):[];
   },
   quoteTravel:async intent=>{
    const state=get();
    if(!state.started||state.selected!==intent.unitId||state.movePending||state.campaignPending)return {error:'c_errorRoute'};
    let result:ReturnType<typeof prepareCampaignTravel>,wasm=false;
    try{
     if(travelWasm&&state.game.movementProfile==='streets-v2'&&['walk','drive','motorcade'].includes(intent.mode)){
      const worker=await travelWasm(state.game,intent);result=worker;wasm=worker.searches>0;
     }else result=prepareCampaignTravel(state.game,intent,vehicle?.runtime);
    }catch{result=prepareCampaignTravel(state.game,intent,vehicle?.runtime);}
    const current=get();
    if(current.game!==state.game||current.selected!==state.selected||current.saveSlot!==state.saveSlot||!current.started)return {error:'c_errorRoute'};
    if(result.quote)quotes.set(result.quote,{game:state.game,next:result.game,slot:state.saveSlot,unitId:intent.unitId,mode:intent.mode,wasm});
    return {quote:result.quote,error:result.error};
   },
   confirmTravel:quote=>{
    const state=get(),pending=quotes.get(quote);
    quotes.delete(quote);
    if(!pending||!state.started||state.movePending||state.campaignPending||state.game!==pending.game||state.saveSlot!==pending.slot||state.selected!==pending.unitId){
     set({error:'a3_stale'});return false;
    }
    const destination=pending.next.units.find(u=>u.id===pending.unitId)!.cellId;
    const engine=pending.wasm?'wasm':'typescript';
    set({game:pending.next,districtId:cells.get(destination)!.districtId,view:'street',error:null,
     ...(pending.mode==='walk'?{lastMoveEngine:engine}:pending.mode==='drive'||pending.mode==='motorcade'?{lastVehicleEngine:engine}:{})});
    persist();return true;
   },
   chooseSlot:slot=>{if(get().started||!isSaveSlot(slot))return;const out=readSlot(slot);set({saveSlot:slot,saved:out.save,saveExists:out.exists,saveError:out.error,error:null,slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});},
   start:(overwrite=false)=>{if(get().started)return;const slot=get().saveSlot,out=readSlot(slot);set({saved:out.save,saveExists:out.exists,slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});if(out.exists&&!overwrite){set({saveError:out.error,error:'s_confirmOverwrite'});return;}set({started:true,error:null});persist();},
   reset:()=>set({...makeFresh(get().game.playerTeam),started:false,error:null,lastVehicleEngine:null,lastNightEngine:null,lastNightSearches:0}),
   faction:team=>{const g=get().game;if(get().started||!teams.includes(team))return;const selected=`${team}1`;set({game:{...g,playerTeam:team},selected,districtId:cells.get(g.units.find(u=>u.id===selected)!.cellId)!.districtId,error:null});},
   commander:id=>{if(!get().started)set({game:chooseCommander(get().game,id),error:null});},
   select:id=>{const s=get(),u=s.game.units.find(u=>u.id===id&&u.team===s.game.playerTeam);if(u){set({selected:id,districtId:cells.get(u.cellId)!.districtId,error:null});if(s.started)persist();}},
   focus:id=>{if(districts.some(d=>d.id===id)){set({districtId:id,view:'street',error:null});if(get().started)persist();}},
   viewCity:()=>{set({view:'city',error:null});if(get().started)persist();},
   dispatch:cmd=>{
    const {started,game,saveSlot,movePending,selected}=get();
    if(!started||get().campaignPending)return;
    if(!planRoadMove||cmd.type!=='move'||game.movementProfile!=='streets-v2'){commit(cmd);return;}
    if(movePending)return;
    const actor=game.units.find(unit=>unit.id===cmd.unitId&&unit.team===game.playerTeam);
    if(!actor||game.result||game.talk){commit(cmd);return;}
    const current=()=>get().started&&get().game===game&&get().saveSlot===saveSlot&&get().selected===selected;
    set({movePending:true,error:null});
    return (async()=>{
     try{
      let edges:Uint32Array|null;
      try{edges=await planRoadMove(game,actor,cmd.cellId);}
      catch{if(current())commit(cmd);return;}
      if(current())commit(cmd,edges??new Uint32Array());
     }finally{set({movePending:false});}
    })();
   },
   vehicleDispatch:cmd=>{if(get().started&&vehicle&&!get().movePending)return run(cmd);},
   end:()=>{const {started,game,movePending}=get();if(!started||game.result||game.phase==='night'&&movePending)return;if(game.talk){set({error:'d_finishFirst'});return;}return run();},
   priority:id=>{if(!get().started||get().campaignPending)return;set({game:prioritizeWonder(get().game,id)});persist();},
   save:()=>{if(get().started)persist();},
   resume:()=>{const slot=get().saveSlot,out=readSlot(slot);set({slots:get().slots.map(s=>s.slot===slot?summary(slot,out):s)});if(out.save)set({...structuredClone(out.save.session),saved:out.save,saveExists:true,saveError:null,started:true,error:null});else set({saved:null,saveExists:out.exists,saveError:out.error??'c_saveInvalid'});},
   menu:()=>{if(!get().started)return;if(persist())set({...makeFresh(get().game.playerTeam),started:false,error:null});},
  };
 });
}
function browserStorage(prefix:string){try{
 if(typeof localStorage==='undefined')return null;
 return {getItem:(key:string)=>localStorage.getItem(prefix+key),setItem:(key:string,value:string)=>localStorage.setItem(prefix+key,value)};
}catch{return null;}}
const testMode=typeof window!=='undefined'&&import.meta.env?.DEV?new URLSearchParams(window.location.search).get('routing'):null;
export const alphaMode=typeof window!=='undefined'&&(import.meta.env.DEV||import.meta.env.MODE==='alpha')&&new URLSearchParams(window.location.search).get('view')!=='2d'&&!testMode;
const wasmEnabled=testMode==='wasm'||testMode==='wasm-vehicle';
const vehicleBase=alphaMode||testMode==='wasm-vehicle'?new URL(`${import.meta.env.BASE_URL}${alphaMode?'alpha-data/':'.tools/'}`,window.location.href).href:undefined;
const client=wasmEnabled||alphaMode?(await import('./rust-move-client.ts')).createRustCampaignClient(
 `${import.meta.env.BASE_URL}${alphaMode?'alpha-data/stksst_core.wasm':'stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm'}`,vehicleBase):undefined;
const vehicle=vehicleBase?await (await import('./rust-vehicle-backend.ts')).readRustVehicleBackend(vehicleBase).catch(()=>undefined):undefined;
export const useCampaign=createCampaignStore(wasmEnabled?memoryStorage():browserStorage(alphaMode?'stksst-alpha:':''),'streets-v2',vehicle,client?.move,client?.run,!!vehicleBase&&!vehicle,client?.travel);

function memoryStorage():StoragePort{
 const slots=new Map<string,string>();
 return {getItem:key=>slots.get(key)??null,setItem:(key,value)=>{slots.set(key,value);}};
}
