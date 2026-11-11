// Local, isolated Node integration audit; never touches the browser's save slots.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {districts,mapFor} from '../src/game/campaign-map.ts';
import {loadVerifiedVehicleBackend} from '../src/game/vehicle-verified-backend.ts';
import {createCampaignStore} from '../src/game/campaign-store.ts';

const files={graph:'.tools/vehicle-graph-prototype-v3.bin.gz',metadata:'.tools/vehicle-graph-prototype-v1.meta.json.gz',connectors:'.tools/vehicle-connectors-prototype-v1.json.gz'};
const bytes=Object.fromEntries(Object.entries(files).map(([key,path])=>{const b=gunzipSync(readFileSync(path));return [key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];}));
const backend=await loadVerifiedVehicleBackend(async key=>bytes[key],districts),data=new Map();
const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const store=createCampaignStore(storage,'streets-v2',backend);store.getState().start();
store.setState(({game})=>({game:{...game,news:'clear',surprise:null}}));
const state=store.getState(),unit=state.game.units.find(u=>u.id==='blue1'),destination=mapFor(state.game).districts.find(d=>d.id==='6300200').anchor;
const began=performance.now();store.getState().vehicleDispatch({unitId:unit.id,mode:'motorcade',cellId:destination});
const done=store.getState();if(done.error||done.saveError)throw Error(`vehicle ${done.error??done.saveError}`);
const resumed=createCampaignStore(storage,'streets-v2',backend);resumed.getState().resume();
if(resumed.getState().saveError||JSON.stringify(resumed.getState().game)!==JSON.stringify(done.game))throw Error('resume mismatch');
const journal=done.game.vehicle.teams.blue.journal,report={status:'isolated Node integration, single route; not a browser or production test',
 from:unit.cellId,to:destination,journeys:journal.journeys.length,actualMetres:journal.journeys[0].actualQuarterMetres/4,
 contacts:done.game.vehicle.teams.blue.exposure.awarded,apBefore:unit.ap,apAfter:done.game.units.find(u=>u.id===unit.id).ap,
 sameGameAfterReload:true,elapsedMs:Math.round(performance.now()-began),rssBytes:process.memoryUsage().rss};
writeFileSync('artifacts/vehicle-store-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
