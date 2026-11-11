/** Opt-in slot adapter for schema 6. Normal campaign-store still uses schema 5. */
import {saveKey} from './campaign-save.ts';
import type {SaveSlot,SaveError,StoragePort} from './campaign-save.ts';
import {decodeVehicleSave,encodeVehicleSave} from './campaign-vehicle-save.ts';
import type {VehicleSaveContext,VehicleSession} from './campaign-vehicle-save.ts';

/** Read-only migration leaves all original slot bytes in place. */
export function readVehicleSlot(storage:StoragePort|null,slot:SaveSlot,context:VehicleSaveContext){
 let raw:string|null;
 try{if(!storage)return {session:null,savedAt:null,error:'c_saveUnavailable' as SaveError,exists:false,migrated:false};raw=storage.getItem(saveKey(slot));}
 catch{return {session:null,savedAt:null,error:'c_saveUnavailable' as SaveError,exists:false,migrated:false};}
 if(raw===null)return {session:null,savedAt:null,error:null,exists:false,migrated:false};
 const result=decodeVehicleSave(raw,context);
 if(!result.session)return {session:null,savedAt:null,error:result.error,exists:true,migrated:false};
 // The codec has validated this field; parsing it here does not modify the slot.
 return {...result,savedAt:JSON.parse(raw).savedAt as string,exists:true};
}

/** Validate the entire new save before touching an existing slot. */
export function writeVehicleSlot(storage:StoragePort|null,slot:SaveSlot,session:VehicleSession,context:VehicleSaveContext){
 if(!storage)return {savedAt:null,error:'c_saveUnavailable' as SaveError};
 let raw:string,savedAt:string;
 try{const encoded=encodeVehicleSave(session,context);raw=JSON.stringify(encoded);savedAt=encoded.savedAt;
  if(raw.length>4_000_000)throw Error('Save too large');
 }catch{return {savedAt:null,error:'c_saveInvalid' as SaveError};}
 try{storage.setItem(saveKey(slot),raw);return {savedAt,error:null};}
 catch{return {savedAt:null,error:'c_saveUnavailable' as SaveError};}
}
