import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { districts, mapFor, streetSource } from '../src/game/campaign-map.ts';
import { initialCampaign } from '../src/game/campaign.ts';
import { endVehicleCampaignPhase } from '../src/game/campaign-vehicle-phase.ts';
import { rustRoadSearch } from '../src/game/rust-campaign-routing.ts';
import { instantiateRustRouting, encodeRoutingMetadata } from '../src/game/rust-routing.ts';
import { instantiateRustVehicle } from '../src/game/rust-vehicle.ts';
import { loadVerifiedVehicleBackend } from '../src/game/vehicle-verified-backend.ts';
import { initialVehicleState } from '../src/game/campaign-vehicle-state.ts';
import { encodeVehicleSave } from '../src/game/campaign-vehicle-save.ts';
import { manifest, readPackage } from '../src/map-packages.ts';
import { encodeVehiclePolicy } from '../src/game/rust-vehicle-policy.ts';

const cwd = new URL('../.tools/', import.meta.url);
const files = { graph:'vehicle-graph-prototype-v3.bin.gz', metadata:'vehicle-graph-prototype-v1.meta.json.gz', connectors:'vehicle-connectors-prototype-v1.json.gz' };
const init = performance.now();
const backend = await loadVerifiedVehicleBackend(async key => {
  const bytes = gunzipSync(await readFile(new URL(files[key],cwd)));
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
},districts);
const module = await WebAssembly.compile(await readFile(new URL('../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm',cwd)));
const alphaPath = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL('stksst-alpha-baseline.wasm',cwd);
const alpha = await WebAssembly.compile(await readFile(alphaPath));
const route = await instantiateRustRouting(module,await readPackage(manifest.core),encodeRoutingMetadata(streetSource));
const oldPlan = await instantiateRustVehicle(alpha,backend.graph);
const policyStart=performance.now();
const policy=encodeVehiclePolicy(backend.graph,backend.turns,backend.districts);
const policyMs=Math.round(performance.now()-policyStart);
const newPlan = await instantiateRustVehicle(module,backend.graph,policy);
console.log(JSON.stringify({initMs:Math.round(performance.now()-init),policyMs,policyBytes:policy.bytes.byteLength,forbidden:policy.forbiddenCount,vehicleNodes:backend.graph.ids.length,vehicleEdges:backend.graph.targets.length}));

function measure(game,label,engine,planLeg){
  const routes=[];
  const result={label,engine,day:game.day,news:game.news,event:game.surprise?.id??null,vehicle:[],walking:{wasm:0,tree:0,calls:0},coverage:0,replay:0};
  const road=rustRoadSearch(options=>{const start=performance.now(); const out=route(options);result.walking.wasm+=performance.now()-start;return out;});
  const roadSearch=(...args)=>{const start=performance.now();const out=road(...args);result.walking.tree+=performance.now()-start;result.walking.calls++;return out;};
  const started=performance.now();
  const next=endVehicleCampaignPhase(game,game.vehicle,(snapshot,team)=>({...backend.runtime.contextFor(snapshot,team),planLeg:opts=>{
    const start=performance.now();const out=planLeg(opts);result.vehicle.push({team,mode:opts.mode,ms:Math.round(performance.now()-start),origins:opts.origins.length,targets:opts.destinations.length,found:!!out,expanded:planLeg.expanded()});routes.push(out);return out;
  }}),{roadSearch,fragmentsForRoute:(...args)=>{const start=performance.now();const out=backend.runtime.fragmentsForRoute(...args);result.coverage+=performance.now()-start;return out;}}).game;
  result.settleMs=Math.round(performance.now()-started);
  const commStart=performance.now();structuredClone(game);structuredClone(next);result.cloneMs=Math.round(performance.now()-commStart);
  const selected=next.units.find(u=>u.team===next.playerTeam);
  const saveStart=performance.now();
  const raw=JSON.stringify(encodeVehicleSave({game:next,selected:selected.id,districtId:mapFor(next).cells.get(selected.cellId).districtId,view:'street'},
    {...backend.saveContext,verifyExposure:(...args)=>{const start=performance.now();const out=backend.saveContext.verifyExposure(...args);result.replay+=performance.now()-start;return out;}}));
  result.saveMs=Math.round(performance.now()-saveStart);result.bytes=Buffer.byteLength(raw);
  for(const key of ['wasm','tree'])result.walking[key]=Math.round(result.walking[key]);
  for(const key of ['coverage','replay'])result[key]=Math.round(result[key]);
  console.log(JSON.stringify(result));
  return {next,routes};
}

function compare(game,label){
  const a=measure(game,label,'alpha',oldPlan),b=measure(game,label,'beta',newPlan);
  assert.deepEqual(b.routes,a.routes,`${label} vehicle routes changed`);
  assert.deepEqual(b.next,a.next,`${label} campaign result changed`);
  return b.next;
}
let game = initialCampaign(17,'blue','streets-v2');
game = {...game,vehicle:initialVehicleState(game,backend.runtime.revision,'new')};
for(let i=0;i<4;i++)game=compare({...game,phase:'night'},'seed-17');
const base={...game,phase:'night',news:'clear',surprise:null};
const works={...base,surprise:{id:'streetworks',districtId:districts[4].id,responses:{blue:null,green:null,white:null}}};
compare(works,'controlled-roadworks-cold');
compare(works,'controlled-roadworks-warm');
compare(base,'controlled-clear');
console.log(JSON.stringify({ matchedScenarios:7, sameRoutes:true, sameCampaignState:true }));
