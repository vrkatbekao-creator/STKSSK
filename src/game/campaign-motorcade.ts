/** Motorcade exposure rules; fragments must come from a trusted, revisioned road/sector intersection. */
import type {Team} from './campaign-teams.ts';
export type CoverageFragment={segment:string;sector:string;district:string;start:number;end:number;segmentLength:number};
type Interval=[number,number];
type Contact={district:string;covered:number;status:'pending'|'blocked'|'awarded'};
export type MotorcadeLedger={day:number;team:Team;covered:Record<string,{length:number;intervals:Interval[]}>;
 contacts:Record<string,Contact>;queue:string[];awarded:number;uniqueQuarterMetres:number;
 heat:Record<string,{day:number;value:number}>;unitContacts:Record<string,number>};
export const motorcadeExposurePolicy=Object.freeze({contactQuarterMetres:1200,budgetQuarterMetres:4000,dailyCap:24,heatCap:6,recoveryDays:2,saturatedAt:3});

export function newMotorcadeLedger(day:number,team:Team,heat:MotorcadeLedger['heat']={}):MotorcadeLedger{
 if(!Number.isInteger(day)||day<1||day>28||!['blue','green','white'].includes(team))throw new RangeError('Invalid motorcade day');
 return {day,team,covered:{},contacts:{},queue:[],awarded:0,uniqueQuarterMetres:0,heat:{...heat},unitContacts:{}};
}
export function motorcadeLedgerForDay(ledger:MotorcadeLedger,day:number){
 if(!Number.isInteger(day)||day<ledger.day||day>28)throw new RangeError('Invalid motorcade day');
 return day===ledger.day?ledger:newMotorcadeLedger(day,ledger.team,ledger.heat);
}
/** Eligibility is consumed even if the shared campaign daily XP cap prevents an award. */
export function creditMotorcadeContacts(ledger:MotorcadeLedger,unitId:string,contacts:number){
 if(!new RegExp(`^${ledger.team}[1-7]$`).test(unitId)||!Number.isSafeInteger(contacts)||contacts<0)throw new RangeError('Invalid motorcade contact credit');
 const previous=ledger.unitContacts[unitId]??0,total=previous+contacts;
 if(!Number.isSafeInteger(previous)||previous<0||!Number.isSafeInteger(total))throw new RangeError('Invalid motorcade contact count');
 return {ledger:{...ledger,unitContacts:{...ledger.unitContacts,[unitId]:total}},xp:Math.min(2,Math.floor(total/3))-Math.min(2,Math.floor(previous/3))};
}
export function motorcadeHeat(ledger:MotorcadeLedger,sector:string,day:number){
 const entry=ledger.heat[sector];if(!entry)return 0;
 if(!Number.isInteger(day)||day<entry.day||day>28)throw new RangeError('Invalid motorcade heat day');
 return Math.max(0,entry.value-Math.floor((day-entry.day)/motorcadeExposurePolicy.recoveryDays));
}
/** Structural validation only: trusted geometry and journey replay are still required. */
export function validMotorcadeLedger(value:unknown,day:number,team:Team,unitIds:readonly string[]):value is MotorcadeLedger{
 const obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const integer=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
 if(!obj(value)||Object.keys(value).sort().join(',')!=='awarded,contacts,covered,day,heat,queue,team,uniqueQuarterMetres,unitContacts'||
  value.day!==day||value.team!==team||!Number.isInteger(day)||day<1||day>28||!['blue','green','white'].includes(team)||
  !obj(value.covered)||!obj(value.contacts)||!obj(value.heat)||!obj(value.unitContacts)||!Array.isArray(value.queue)||
  !integer(value.awarded)||!integer(value.uniqueQuarterMetres)||value.awarded>motorcadeExposurePolicy.dailyCap)return false;
 let unique=0;
 for(const [key,raw] of Object.entries(value.covered)){
  if(!key||key.length>160||['__proto__','constructor','prototype'].includes(key)||!obj(raw)||Object.keys(raw).sort().join(',')!=='intervals,length'||
   !integer(raw.length)||raw.length===0||!Array.isArray(raw.intervals)||raw.intervals.length>10000)return false;
  let previous=-1;for(const interval of raw.intervals){if(!Array.isArray(interval)||interval.length!==2||!integer(interval[0])||!integer(interval[1])||
   interval[0]<=previous||interval[1]<=interval[0]||interval[1]>raw.length)return false;unique+=interval[1]-interval[0];previous=interval[1];}
 }
 if(!Number.isSafeInteger(unique)||unique!==value.uniqueQuarterMetres)return false;
 let total=0,qualified=0,awarded=0;const pending=new Set<string>();
 for(const [sector,raw] of Object.entries(value.contacts)){
  if(!obj(raw)||Object.keys(raw).sort().join(',')!=='covered,district,status'||typeof raw.district!=='string'||!/^(630|640)\d{4}$/.test(raw.district)||
   !sector.startsWith(`${raw.district}:`)||sector.length>160||!integer(raw.covered)||!['pending','blocked','awarded'].includes(raw.status))return false;
  total+=raw.covered;if(raw.covered>=motorcadeExposurePolicy.contactQuarterMetres){qualified++;if(raw.status==='pending')pending.add(sector);if(raw.status==='awarded')awarded++;}
  else if(raw.status!=='pending')return false;
 }
 if(!Number.isSafeInteger(total)||total!==unique||awarded!==value.awarded||awarded>Math.floor(unique/motorcadeExposurePolicy.budgetQuarterMetres)||
  new Set(value.queue).size!==value.queue.length||value.queue.length!==pending.size||!value.queue.every((x:unknown)=>typeof x==='string'&&pending.has(x)))return false;
 for(const [sector,raw] of Object.entries(value.heat))if(!sector||sector.length>160||!obj(raw)||Object.keys(raw).sort().join(',')!=='day,value'||
  !integer(raw.day)||raw.day<1||raw.day>day||!integer(raw.value)||raw.value>motorcadeExposurePolicy.heatCap)return false;
 let credited=0;for(const [id,count] of Object.entries(value.unitContacts)){
  if(!unitIds.includes(id)||!new RegExp(`^${team}[1-7]$`).test(id)||!integer(count))return false;credited+=Number(count);
 }
 return Number.isSafeInteger(credited)&&credited===qualified;
}
function merge(intervals:readonly Interval[],start:number,end:number):{intervals:Interval[];added:number}{
 const all=[...intervals.map(i=>[...i] as Interval),[start,end] as Interval].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out:Interval[]=[];
 for(const current of all){const last=out.at(-1);if(last&&current[0]<=last[1])last[1]=Math.max(last[1],current[1]);else out.push([...current]);}
 const size=(xs:readonly Interval[])=>xs.reduce((sum,x)=>sum+x[1]-x[0],0);
 return {intervals:out,added:size(out)-size(intervals)};
}

/** Atomic, read-only input. Points are fictional influence, never disclosed polling percentages. */
export function applyMotorcadeExposure(original:MotorcadeLedger,fragments:readonly CoverageFragment[],footHeat:(sector:string)=>number){
 if(!Array.isArray(fragments)||fragments.length>10000)throw new RangeError('Invalid motorcade fragments');
 const next=structuredClone(original),awards:Record<string,number>={};let newlyReached=0;
 for(const part of fragments){
  if(!part||typeof part.segment!=='string'||!part.segment||part.segment.length>160||['__proto__','constructor','prototype'].includes(part.segment)||typeof part.sector!=='string'||!part.sector||part.sector.length>160||
   typeof part.district!=='string'||!/^(630|640)\d{4}$/.test(part.district)||!part.sector.startsWith(`${part.district}:`)||
   ![part.start,part.end,part.segmentLength].every(Number.isSafeInteger)||part.start<0||part.end<=part.start||part.end>part.segmentLength)throw new RangeError('Invalid motorcade fragment');
  const existing=next.covered[part.segment];if(existing&&existing.length!==part.segmentLength)throw new RangeError('Conflicting motorcade segment');
  const merged=merge(existing?.intervals??[],part.start,part.end);next.covered[part.segment]={length:part.segmentLength,intervals:merged.intervals};
  if(!merged.added)continue;
  next.uniqueQuarterMetres+=merged.added;if(!Number.isSafeInteger(next.uniqueQuarterMetres))throw new RangeError('Motorcade distance overflow');
  const prior=next.contacts[part.sector];if(prior&&prior.district!==part.district)throw new RangeError('Conflicting motorcade district');
  const contact=prior??{district:part.district,covered:0,status:'pending' as const};
  const before=contact.covered;contact.covered+=merged.added;if(!Number.isSafeInteger(contact.covered))throw new RangeError('Motorcade sector overflow');
  next.contacts[part.sector]=contact;
  if(before<motorcadeExposurePolicy.contactQuarterMetres&&contact.covered>=motorcadeExposurePolicy.contactQuarterMetres){
   const foot=footHeat(part.sector);if(!Number.isInteger(foot)||foot<0||foot>motorcadeExposurePolicy.heatCap)throw new RangeError('Invalid outreach heat');
   const h=next.heat[part.sector],cooled=h?Math.max(0,h.value-Math.floor((next.day-h.day)/motorcadeExposurePolicy.recoveryDays)):0;
   if(h&&(!Number.isInteger(h.day)||h.day>next.day||h.day<1||!Number.isInteger(h.value)||h.value<0||h.value>motorcadeExposurePolicy.heatCap))throw new RangeError('Invalid motorcade heat');
   contact.status=Math.max(cooled,foot)>=motorcadeExposurePolicy.saturatedAt?'blocked':'pending';
   next.heat[part.sector]={day:next.day,value:Math.min(motorcadeExposurePolicy.heatCap,cooled+1)};
   if(contact.status==='pending')next.queue.push(part.sector);newlyReached++;
  }
  const budget=Math.min(motorcadeExposurePolicy.dailyCap,Math.floor(next.uniqueQuarterMetres/motorcadeExposurePolicy.budgetQuarterMetres));
  while(next.awarded<budget&&next.queue.length){const key=next.queue.shift()!,item=next.contacts[key];
   if(!item||item.status!=='pending')throw new RangeError('Invalid motorcade queue');
   item.status='awarded';next.awarded++;awards[item.district]=(awards[item.district]??0)+1;
  }
 }
 return {ledger:next,awards,newlyReached};
}
