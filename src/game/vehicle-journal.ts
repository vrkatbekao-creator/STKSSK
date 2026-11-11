/** Preliminary vehicle save validation. Not connected to campaign-save or runtime state. */
import type {Team} from './campaign-teams.ts';
import type {VehicleMode} from './vehicle-cost.ts';
import type {VehicleTeamLedger} from './vehicle-ledger.ts';
import type {VehicleGraphColumns} from './vehicle-graph-format.ts';
import {validVehicleLedger} from './vehicle-ledger.ts';
import {vehicleEdgeQuarterMetres} from './vehicle-routing.ts';

export type VehicleJourney={day:number;phase:'day'|'night';unitId:string;mode:VehicleMode;fromCell:string;toCell:string;
 boardEdges:number[];carStart:number;carEdges:number[];weights:number[];alightStart:number;alightEdges:number[];
 actualQuarterMetres:number;weightedQuarterMetres:number};
export type VehicleJournal={revision:string;ledger:VehicleTeamLedger;journeys:VehicleJourney[]};
export type JournalWalkingEdge={from:number;to:number;metres:number};
export type VehicleJournalContext={revision:string;day:number;phase:'day'|'night';team:Team;unitIds:readonly string[];
 graph:VehicleGraphColumns;walkingEdges:readonly JournalWalkingEdge[];cellRoadNode:ReadonlyMap<string,number>;
 connectors:ReadonlyMap<number,readonly number[]>;allowTurn:(incoming:bigint,node:bigint,outgoing:bigint)=>boolean};

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const indexList=(v:unknown,max:number,minimum=0):v is number[]=>Array.isArray(v)&&v.length>=minimum&&v.length<=10000&&v.every(i=>Number.isInteger(i)&&i>=0&&i<max);

/** Caller must authenticate the graph/connector context and source revision first. */
export function validVehicleJournal(value:unknown,ctx:VehicleJournalContext):value is VehicleJournal{
 if(!object(value)||!exact(value,['revision','ledger','journeys'])||value.revision!==ctx.revision||
  !validVehicleLedger(value.ledger,ctx.day,ctx.team,ctx.unitIds)||!Array.isArray(value.journeys)||value.journeys.length>10000)return false;
 const ledger=value.ledger,totals:Record<string,{drive:number;motorcade:number}>={};let actualToday=0,lastTime=0;
 const walking=(start:number,edges:number[])=>{let node=start,metres=0;for(const id of edges){const e=ctx.walkingEdges[id];
  if(!e||e.from!==node||!Number.isFinite(e.metres)||e.metres<=0)return null;node=e.to;metres+=e.metres;if(metres>600)return null;}return node;};
 for(const raw of value.journeys){
  if(!object(raw)||!exact(raw,['day','phase','unitId','mode','fromCell','toCell','boardEdges','carStart','carEdges','weights','alightStart','alightEdges','actualQuarterMetres','weightedQuarterMetres'])||
   !Number.isInteger(raw.day)||Number(raw.day)<1||Number(raw.day)>ctx.day||!['day','night'].includes(String(raw.phase))||
   typeof raw.unitId!=='string'||!ctx.unitIds.includes(raw.unitId)||!['drive','motorcade'].includes(String(raw.mode))||
   typeof raw.fromCell!=='string'||typeof raw.toCell!=='string'||!ctx.cellRoadNode.has(raw.fromCell)||!ctx.cellRoadNode.has(raw.toCell)||
   !indexList(raw.boardEdges,ctx.walkingEdges.length)||!indexList(raw.alightEdges,ctx.walkingEdges.length)||
   !Number.isInteger(raw.carStart)||Number(raw.carStart)<0||Number(raw.carStart)>=ctx.graph.ids.length||
   !Number.isInteger(raw.alightStart)||Number(raw.alightStart)<0||!indexList(raw.carEdges,ctx.graph.targets.length,1)||
   !Array.isArray(raw.weights)||raw.weights.length!==raw.carEdges.length||!raw.weights.every(w=>Number.isInteger(w)&&w>=4&&w<=7))return false;
  const day=Number(raw.day),phase=raw.phase as 'day'|'night',time=day*2+(phase==='night'?1:0);
  if(time<lastTime||(day===ctx.day&&ctx.phase==='day'&&phase==='night'))return false;lastTime=time;
  const boardEnd=walking(ctx.cellRoadNode.get(raw.fromCell)!,raw.boardEdges);
  if(boardEnd===null||!ctx.connectors.get(boardEnd)?.includes(Number(raw.carStart)))return false;
  let node=Number(raw.carStart),previous:bigint|null=null,actual=0,weighted=0;
  for(let i=0;i<raw.carEdges.length;i++){
   const edge=raw.carEdges[i],way=ctx.graph.ways[edge];
   if(edge<ctx.graph.offsets[node]||edge>=ctx.graph.offsets[node+1]||
      previous!==null&&!ctx.allowTurn(previous,ctx.graph.ids[node],way))return false;
   const d=vehicleEdgeQuarterMetres(ctx.graph.metres[edge]);actual+=d;weighted+=Math.ceil(d*Number(raw.weights[i])/4);
   if(!Number.isSafeInteger(actual)||!Number.isSafeInteger(weighted))return false;
   node=ctx.graph.targets[edge];previous=way;
  }
  if(!ctx.connectors.get(Number(raw.alightStart))?.includes(node)||
     walking(Number(raw.alightStart),raw.alightEdges)!==ctx.cellRoadNode.get(raw.toCell)||
     raw.actualQuarterMetres!==actual||raw.weightedQuarterMetres!==weighted)return false;
  if(day===ctx.day){const unit=totals[raw.unitId]??{drive:0,motorcade:0};unit[raw.mode as VehicleMode]+=weighted;
   if(!Number.isSafeInteger(unit.drive+unit.motorcade)||!Number.isSafeInteger(actualToday+actual))return false;
   totals[raw.unitId]=unit;actualToday+=actual;}
 }
 if(actualToday!==ledger.actualQuarterMetres)return false;
 const ledgerIds=Object.keys(ledger.units).sort(),totalIds=Object.keys(totals).sort();
 return JSON.stringify(ledgerIds)===JSON.stringify(totalIds)&&ledgerIds.every(id=>ledger.units[id].drive===totals[id].drive&&ledger.units[id].motorcade===totals[id].motorcade);
}
